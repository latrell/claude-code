import { createLogger } from './logger.js'
import { decodeJsonWsMessage, WsPayloadTooLargeError } from './ws-message.js'
import { encodeWebSocketAuthProtocol } from './ws-auth.js'
import { t, tf } from '../../../src/i18n/t.js'

export interface RcsUpstreamConfig {
  rcsUrl: string // e.g. "http://localhost:3000"
  apiToken: string
  agentName: string
  channelGroupId?: string
  capabilities?: Record<string, unknown>
  maxSessions?: number
}

export function buildRcsWsUrl(rcsUrl: string): string {
  let raw = rcsUrl
  raw = raw.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://')
  const url = new URL(raw)
  const path = url.pathname.replace(/\/+$/, '')
  if (!path || path === '/') {
    url.pathname = '/acp/ws'
  }
  url.searchParams.delete('token')
  return url.toString()
}

/**
 * RCS upstream client — connects acp-link to a Remote Control Server.
 *
 * Lifecycle:
 * 1. connect() — opens WS to RCS
 * 2. Sends register message
 * 3. Waits for registered response
 * 4. Forwards all ACP events via send()
 * 5. Reconnects with exponential backoff on failure
 */
export class RcsUpstreamClient {
  private static log = createLogger('rcs-upstream')
  private ws: WebSocket | null = null
  private registered = false
  private reconnectAttempts = 0
  private closed = false
  private readonly maxReconnectDelay = 30_000
  private readonly baseReconnectDelay = 1_000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private registrationController: AbortController | null = null
  /** Agent ID obtained from REST registration */
  private agentId: string | null = null
  /** Session ID from REST registration (ACP agents auto-create a session) */
  private sessionId: string | undefined

  /** Handler for incoming ACP messages from RCS relay */
  private messageHandler:
    | ((message: Record<string, unknown>) => void | Promise<void>)
    | null = null
  private disconnectHandler: (() => void | Promise<void>) | null = null

  constructor(private config: RcsUpstreamConfig) {}

  /** Get the agent ID from REST registration */
  getAgentId(): string | null {
    return this.agentId
  }

  /** Set handler for incoming ACP messages from RCS relay */
  setMessageHandler(
    handler: (message: Record<string, unknown>) => void | Promise<void>,
  ): void {
    this.messageHandler = handler
  }

  /** Stop active work if the upstream control transport disappears. */
  setDisconnectHandler(handler: () => void | Promise<void>): void {
    this.disconnectHandler = handler
  }

  /** Register via REST API before establishing WS connection */
  private async registerViaRest(): Promise<string> {
    const baseUrl = this.config.rcsUrl
      .replace(/^ws:\/\//, 'http://')
      .replace(/^wss:\/\//, 'https://')
      .replace(/\/acp\/ws.*$/, '')
      .replace(/\/$/, '')

    const url = `${baseUrl}/v1/environments/bridge`
    RcsUpstreamClient.log.info({ url }, 'REST register')

    const controller = new AbortController()
    this.registrationController = controller
    const timeout = setTimeout(
      () => controller.abort(new Error('RCS registration timed out')),
      10_000,
    )
    let resp: Response
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiToken}`,
        },
        body: JSON.stringify({
          machine_name: this.config.agentName,
          worker_type: 'acp',
          bridge_id: this.config.channelGroupId || undefined,
          max_sessions: this.config.maxSessions,
          capabilities: this.config.capabilities,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
      if (this.registrationController === controller) {
        this.registrationController = null
      }
    }

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(`REST register failed (${resp.status}): ${text}`)
    }

    const data = (await resp.json()) as {
      environment_id: string
      environment_secret: string
      status: string
      session_id?: string
    }
    this.agentId = data.environment_id
    this.sessionId = data.session_id
    RcsUpstreamClient.log.info(
      { agentId: this.agentId, sessionId: this.sessionId },
      'REST register success',
    )
    return data.environment_id
  }

  /** Normalize RCS URL: accept http(s) base URL and convert to ws(s) + /acp/ws path */
  private buildWsUrl(): string {
    return buildRcsWsUrl(this.config.rcsUrl)
  }

  /** Open connection to RCS: REST register → WS identify */
  async connect(): Promise<void> {
    if (this.closed) return

    // Step 1: REST registration
    try {
      await this.registerViaRest()
    } catch (err) {
      RcsUpstreamClient.log.error({ err }, 'REST registration failed')
      if (!this.closed) {
        this.scheduleReconnect()
      }
      return
    }

    // Step 2: WebSocket connection with identify
    const wsUrl = this.buildWsUrl()
    RcsUpstreamClient.log.info({ url: wsUrl }, 'connecting WS')

    return new Promise((resolve, reject) => {
      const identifyTimeout = setTimeout(() => {
        reject(new Error('Timed out waiting for RCS WebSocket identification'))
        this.ws?.close(4000, 'identification timeout')
      }, 10_000)
      const resolveConnect = () => {
        clearTimeout(identifyTimeout)
        resolve()
      }
      const rejectConnect = (error: Error) => {
        clearTimeout(identifyTimeout)
        reject(error)
      }
      try {
        this.ws = new WebSocket(wsUrl, [
          encodeWebSocketAuthProtocol(this.config.apiToken),
        ])

        this.ws.onopen = () => {
          RcsUpstreamClient.log.debug('ws open — sending identify')
          this.ws!.send(
            JSON.stringify({
              type: 'identify',
              agent_id: this.agentId,
            }),
          )
        }

        this.ws.onmessage = event => {
          let data: Record<string, unknown>
          try {
            data = decodeJsonWsMessage(event.data)
          } catch (err) {
            if (err instanceof WsPayloadTooLargeError) {
              RcsUpstreamClient.log.warn(
                { error: err.message },
                'server message too large',
              )
              this.ws?.close(1009, 'message too large')
              return
            }
            RcsUpstreamClient.log.warn(
              { raw: String(event.data).slice(0, 200) },
              'invalid JSON from server',
            )
            return
          }

          if (data.type === 'identified') {
            RcsUpstreamClient.log.info(
              {
                agent_id: data.agent_id,
                channel_group_id: data.channel_group_id,
              },
              'identified',
            )
            this.registered = true
            this.reconnectAttempts = 0
            const webBase = this.config.rcsUrl
              .replace(/^ws:\/\//, 'http://')
              .replace(/^wss:\/\//, 'https://')
              .replace(/\/acp\/ws.*$/, '')
              .replace(/\/$/, '')
            console.log()
            console.log(tf('  🔗 Dashboard: {url}/code/', { url: webBase }))
            if (this.agentId) {
              console.log(tf('     Agent ID: {id}', { id: this.agentId }))
            }
            console.log()
            resolveConnect()
          } else if (data.type === 'registered') {
            // Legacy fallback: server still uses old register flow
            RcsUpstreamClient.log.info(
              { agent_id: data.agent_id },
              'registered (legacy)',
            )
            this.agentId = (data.agent_id as string) || this.agentId
            this.registered = true
            this.reconnectAttempts = 0
            resolveConnect()
          } else if (data.type === 'error') {
            RcsUpstreamClient.log.error(
              { message: data.message },
              'server error',
            )
            if (!this.registered) {
              rejectConnect(new Error(data.message as string))
              this.ws?.close(4000, 'registration rejected')
            }
          } else if (data.type === 'keep_alive') {
            // ignore keepalive
          } else {
            // Forward ACP protocol messages to handler (for RCS relay support).
            // This branch handles both the legacy `{type, payload}` envelope
            // and JSON-RPC 2.0 messages (which have no `type` field) so the
            // relay preserves the JSON-RPC format end-to-end (audit §8.12).
            RcsUpstreamClient.log.debug(
              { type: data.type, method: data.method },
              'forwarding to relay handler',
            )
            void Promise.resolve()
              .then(() => this.messageHandler?.(data))
              .catch(error => {
                RcsUpstreamClient.log.error(
                  { error: (error as Error).message },
                  'relay message handler failed',
                )
              })
          }
        }

        this.ws.onerror = () => {
          // onclose fires after onerror with the actual close code, so we log there
          if (!this.registered) {
            rejectConnect(new Error('WebSocket connection failed'))
          }
        }

        this.ws.onclose = event => {
          const wasRegistered = this.registered
          RcsUpstreamClient.log.info(
            { code: event.code, reason: event.reason || undefined },
            'ws closed',
          )
          this.registered = false
          this.ws = null
          if (!wasRegistered) {
            rejectConnect(
              new Error(`WebSocket closed before registration (${event.code})`),
            )
          }
          const cleanup = wasRegistered
            ? Promise.resolve(this.disconnectHandler?.())
            : Promise.resolve()
          void cleanup
            .catch(error => {
              RcsUpstreamClient.log.error(
                { error: (error as Error).message },
                'upstream disconnect cleanup failed',
              )
            })
            .finally(() => {
              if (!this.closed) this.scheduleReconnect()
            })
        }
      } catch (err) {
        RcsUpstreamClient.log.error({ err }, 'connect threw')
        rejectConnect(err as Error)
      }
    })
  }

  /** Send an ACP message to RCS for broadcast */
  send(message: object): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.registered) {
      return
    }
    try {
      this.ws.send(JSON.stringify(message))
    } catch (err) {
      RcsUpstreamClient.log.error({ err }, 'send failed')
    }
  }

  /** Check if registered with RCS */
  isRegistered(): boolean {
    return (
      this.registered &&
      this.ws !== null &&
      this.ws.readyState === WebSocket.OPEN
    )
  }

  /** Close the RCS connection permanently */
  async close(): Promise<void> {
    this.closed = true
    this.registered = false
    this.registrationController?.abort(new Error('RCS client closed'))
    this.registrationController = null
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const ws = this.ws
    let closeError: Error | null = null
    if (ws) {
      const closed = new Promise<boolean>(resolve => {
        const timeout = setTimeout(() => resolve(false), 2_000)
        ws.addEventListener(
          'close',
          () => {
            clearTimeout(timeout)
            resolve(true)
          },
          { once: true },
        )
      })
      ws.close(1000, 'client shutdown')
      if (!(await closed)) {
        closeError = new Error('Timed out closing RCS WebSocket')
      } else {
        this.ws = null
      }
    }
    await this.disconnectHandler?.()
    if (closeError) throw closeError
    RcsUpstreamClient.log.info('closed')
  }

  private scheduleReconnect(): void {
    if (this.closed) return

    const delay = Math.min(
      this.baseReconnectDelay * 2 ** this.reconnectAttempts,
      this.maxReconnectDelay,
    )
    const jitter = delay * Math.random() * 0.2
    const actualDelay = delay + jitter
    this.reconnectAttempts++

    RcsUpstreamClient.log.warn(
      { attempt: this.reconnectAttempts, delayMs: Math.round(actualDelay) },
      'reconnecting',
    )

    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (this.closed) return
      try {
        await this.connect()
      } catch {
        // connect() itself logs the error; nothing to add here
      }
    }, actualDelay)
  }
}
