import { randomUUID } from 'crypto'
import { getOauthConfig } from '../constants/oauth.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type {
  SDKControlCancelRequest,
  SDKControlRequest,
  SDKControlRequestInner,
  SDKControlResponse,
} from '../entrypoints/sdk/controlTypes.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { logError } from '../utils/log.js'
import { getWebSocketTLSOptions } from '../utils/mtls.js'
import { getWebSocketProxyAgent, getWebSocketProxyUrl } from '../utils/proxy.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'

const RECONNECT_DELAY_MS = 2000
const MAX_RECONNECT_ATTEMPTS = 5
const PING_INTERVAL_MS = 30000
const CONTROL_REQUEST_TIMEOUT_MS = 10000

/**
 * Maximum retries for 4001 (session not found). During compaction the
 * server may briefly consider the session stale; a short retry window
 * lets the client recover without giving up permanently.
 */
const MAX_SESSION_NOT_FOUND_RETRIES = 3

/**
 * WebSocket close codes that indicate a permanent server-side rejection.
 * The client stops reconnecting immediately.
 * Note: 4001 (session not found) is handled separately with limited
 * retries since it can be transient during compaction.
 */
const PERMANENT_CLOSE_CODES = new Set([
  4003, // unauthorized
])

type WebSocketState = 'connecting' | 'connected' | 'closed'

type SessionsMessage =
  | SDKMessage
  | SDKControlRequest
  | SDKControlResponse
  | SDKControlCancelRequest

function isSessionsMessage(value: unknown): value is SessionsMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false
  }
  // Accept any message with a string `type` field. Downstream handlers
  // (sdkMessageAdapter, RemoteSessionManager) decide what to do with
  // unknown types. A hardcoded allowlist here would silently drop new
  // message types the backend starts sending before the client is updated.
  return typeof value.type === 'string'
}

function isControlResponse(value: unknown): value is SDKControlResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'control_response' &&
    'response' in value
  )
}

export type SessionsWebSocketCallbacks = {
  onMessage: (message: SessionsMessage) => void
  onClose?: () => void
  onError?: (error: Error) => void
  onConnected?: () => void
  /** Fired when a transient close is detected and a reconnect is scheduled.
   *  onClose fires only for permanent close (server ended / attempts exhausted). */
  onReconnecting?: () => void
}

type SessionsWebSocketOptions = {
  /** @internal Allows acknowledgement tests to use a short deadline. */
  controlRequestTimeoutMs?: number
}

// Common interface between globalThis.WebSocket and ws.WebSocket
type WebSocketLike = {
  close(): void
  send(data: string): void
  ping?(): void // Bun & ws both support this
}

/**
 * WebSocket client for connecting to CCR sessions via /v1/sessions/ws/{id}/subscribe
 *
 * Protocol:
 * 1. Connect to wss://api.anthropic.com/v1/sessions/ws/{sessionId}/subscribe?organization_uuid=...
 * 2. Send auth message: { type: 'auth', credential: { type: 'oauth', token: '...' } }
 * 3. Receive SDKMessage stream from the session
 */
export class SessionsWebSocket {
  private ws: WebSocketLike | null = null
  private state: WebSocketState = 'closed'
  private reconnectAttempts = 0
  private sessionNotFoundRetries = 0
  private pingInterval: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private pendingControlRequests = new Map<
    string,
    {
      resolve: (response: SDKControlResponse) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private queuedControlRequests = new Map<string, string>()
  private connectionGeneration = 0

  constructor(
    private readonly sessionId: string,
    private readonly orgUuid: string,
    private readonly getAccessToken: () => string,
    private readonly callbacks: SessionsWebSocketCallbacks,
    private readonly options: SessionsWebSocketOptions = {},
  ) {}

  /**
   * Connect to the sessions WebSocket endpoint
   */
  async connect(): Promise<void> {
    if (this.state === 'connecting' || this.state === 'connected') {
      logForDebugging('[SessionsWebSocket] Already connected or connecting')
      return
    }

    const generation = ++this.connectionGeneration
    this.state = 'connecting'

    const baseUrl = getOauthConfig().BASE_API_URL.replace('http', 'ws')
    const url = `${baseUrl}/v1/sessions/ws/${this.sessionId}/subscribe?organization_uuid=${this.orgUuid}`

    logForDebugging(`[SessionsWebSocket] Connecting to ${url}`)

    // Get fresh token for each connection attempt
    const accessToken = this.getAccessToken()
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'anthropic-version': '2023-06-01',
    }

    if (typeof Bun !== 'undefined') {
      // Bun's WebSocket supports headers/proxy options but the DOM typings don't
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      const ws = new globalThis.WebSocket(url, {
        headers,
        proxy: getWebSocketProxyUrl(url),
        tls: getWebSocketTLSOptions() || undefined,
      } as unknown as string[])
      this.ws = ws

      ws.addEventListener('open', () => {
        if (this.ws !== ws || this.connectionGeneration !== generation) return
        logForDebugging(
          '[SessionsWebSocket] Connection opened, authenticated via headers',
        )
        this.handleConnected()
      })

      ws.addEventListener('message', (event: MessageEvent) => {
        if (this.ws !== ws || this.connectionGeneration !== generation) return
        const data =
          typeof event.data === 'string' ? event.data : String(event.data)
        this.handleMessage(data)
      })

      ws.addEventListener('error', () => {
        if (this.ws !== ws || this.connectionGeneration !== generation) return
        const err = new Error('[SessionsWebSocket] WebSocket error')
        logError(err)
        this.callbacks.onError?.(err)
      })

      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      ws.addEventListener('close', (event: CloseEvent) => {
        if (this.ws !== ws || this.connectionGeneration !== generation) return
        logForDebugging(
          `[SessionsWebSocket] Closed: code=${event.code} reason=${event.reason}`,
        )
        this.handleClose(event.code)
      })

      ws.addEventListener('pong', () => {
        if (this.ws !== ws || this.connectionGeneration !== generation) return
        logForDebugging('[SessionsWebSocket] Pong received')
      })
    } else {
      const { default: WS } = await import('ws')
      if (
        this.connectionGeneration !== generation ||
        this.state !== 'connecting'
      ) {
        return
      }
      const ws = new WS(url, {
        headers,
        agent: getWebSocketProxyAgent(url),
        ...getWebSocketTLSOptions(),
      })
      this.ws = ws

      ws.on('open', () => {
        if (this.ws !== ws || this.connectionGeneration !== generation) return
        logForDebugging(
          '[SessionsWebSocket] Connection opened, authenticated via headers',
        )
        // Auth is handled via headers, so we're immediately connected
        this.handleConnected()
      })

      ws.on('message', (data: Buffer) => {
        if (this.ws !== ws || this.connectionGeneration !== generation) return
        this.handleMessage(data.toString())
      })

      ws.on('error', (err: Error) => {
        if (this.ws !== ws || this.connectionGeneration !== generation) return
        logError(new Error(`[SessionsWebSocket] Error: ${err.message}`))
        this.callbacks.onError?.(err)
      })

      ws.on('close', (code: number, reason: Buffer) => {
        if (this.ws !== ws || this.connectionGeneration !== generation) return
        logForDebugging(
          `[SessionsWebSocket] Closed: code=${code} reason=${reason.toString()}`,
        )
        this.handleClose(code)
      })

      ws.on('pong', () => {
        if (this.ws !== ws || this.connectionGeneration !== generation) return
        logForDebugging('[SessionsWebSocket] Pong received')
      })
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message: unknown = jsonParse(data)

      // Forward SDK messages to callback
      if (isSessionsMessage(message)) {
        if (isControlResponse(message)) {
          this.resolveControlRequest(message)
        }
        this.callbacks.onMessage(message)
      } else {
        logForDebugging(
          `[SessionsWebSocket] Ignoring message type: ${typeof message === 'object' && message !== null && 'type' in message ? String(message.type) : 'unknown'}`,
        )
      }
    } catch (error) {
      logError(
        new Error(
          `[SessionsWebSocket] Failed to parse message: ${errorMessage(error)}`,
        ),
      )
    }
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(closeCode: number): void {
    this.stopPingInterval()

    if (this.state === 'closed') {
      return
    }

    this.ws = null

    const previousState = this.state
    this.state = 'closed'

    // Permanent codes: stop reconnecting — server has definitively ended the session
    if (PERMANENT_CLOSE_CODES.has(closeCode)) {
      logForDebugging(
        `[SessionsWebSocket] Permanent close code ${closeCode}, not reconnecting`,
      )
      this.rejectPendingControlRequests(
        new Error(`Session WebSocket closed permanently (${closeCode})`),
      )
      this.callbacks.onClose?.()
      return
    }

    // 4001 (session not found) can be transient during compaction: the
    // server may briefly consider the session stale while the CLI worker
    // is busy with the compaction API call and not emitting events.
    if (closeCode === 4001) {
      this.sessionNotFoundRetries++
      if (this.sessionNotFoundRetries > MAX_SESSION_NOT_FOUND_RETRIES) {
        logForDebugging(
          `[SessionsWebSocket] 4001 retry budget exhausted (${MAX_SESSION_NOT_FOUND_RETRIES}), not reconnecting`,
        )
        this.rejectPendingControlRequests(
          new Error('Session WebSocket reconnect budget exhausted'),
        )
        this.callbacks.onClose?.()
        return
      }
      this.scheduleReconnect(
        RECONNECT_DELAY_MS * this.sessionNotFoundRetries,
        `4001 attempt ${this.sessionNotFoundRetries}/${MAX_SESSION_NOT_FOUND_RETRIES}`,
      )
      return
    }

    // Attempt reconnection if we were connected
    if (
      previousState === 'connected' &&
      this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS
    ) {
      this.reconnectAttempts++
      this.scheduleReconnect(
        RECONNECT_DELAY_MS,
        `attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`,
      )
    } else {
      logForDebugging('[SessionsWebSocket] Not reconnecting')
      this.rejectPendingControlRequests(
        new Error(
          'Session WebSocket disconnected before control acknowledgement',
        ),
      )
      this.callbacks.onClose?.()
    }
  }

  private handleConnected(): void {
    this.state = 'connected'
    this.reconnectAttempts = 0
    this.sessionNotFoundRetries = 0
    this.startPingInterval()
    this.flushQueuedControlRequests()
    this.callbacks.onConnected?.()
  }

  private scheduleReconnect(delay: number, label: string): void {
    this.callbacks.onReconnecting?.()
    logForDebugging(
      `[SessionsWebSocket] Scheduling reconnect (${label}) in ${delay}ms`,
    )
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, delay)
  }

  private startPingInterval(): void {
    this.stopPingInterval()

    this.pingInterval = setInterval(() => {
      if (this.ws && this.state === 'connected') {
        try {
          this.ws.ping?.()
        } catch {
          // Ignore ping errors, close handler will deal with connection issues
        }
      }
    }, PING_INTERVAL_MS)
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  /**
   * Send a control response back to the session
   */
  sendControlResponse(response: SDKControlResponse): void {
    if (!this.ws || this.state !== 'connected') {
      logError(new Error('[SessionsWebSocket] Cannot send: not connected'))
      return
    }

    logForDebugging('[SessionsWebSocket] Sending control response')
    this.ws.send(jsonStringify(response))
  }

  /**
   * Send a control request to the session (e.g., interrupt)
   */
  sendControlRequest(
    request: SDKControlRequestInner,
  ): Promise<SDKControlResponse> {
    const requestId = randomUUID()
    const controlRequest: SDKControlRequest = {
      type: 'control_request',
      request_id: requestId,
      request,
    }
    const serialized = jsonStringify(controlRequest)

    logForDebugging(
      `[SessionsWebSocket] Sending control request: ${request.subtype}`,
    )
    return new Promise<SDKControlResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingControlRequests.delete(requestId)
        this.queuedControlRequests.delete(requestId)
        reject(
          new Error(`Timed out waiting for ${request.subtype} acknowledgement`),
        )
      }, this.options.controlRequestTimeoutMs ?? CONTROL_REQUEST_TIMEOUT_MS)
      this.pendingControlRequests.set(requestId, { resolve, reject, timer })
      // Keep the serialized request until acknowledgement. If the socket
      // drops after send() but before the response, reconnect will replay the
      // same idempotent request_id instead of guessing whether it arrived.
      this.queuedControlRequests.set(requestId, serialized)

      if (this.ws && this.state === 'connected') {
        this.sendQueuedControlRequest(requestId, serialized)
      }
    })
  }

  private sendQueuedControlRequest(
    requestId: string,
    serialized: string,
  ): void {
    if (!this.ws || this.state !== 'connected') {
      this.queuedControlRequests.set(requestId, serialized)
      return
    }
    try {
      this.ws.send(serialized)
    } catch (error) {
      // A close event normally follows a failed send and schedules reconnect.
      // Keep the request queued; its timeout remains the final bound.
      logError(error instanceof Error ? error : new Error(errorMessage(error)))
    }
  }

  private flushQueuedControlRequests(): void {
    for (const [requestId, serialized] of this.queuedControlRequests) {
      this.sendQueuedControlRequest(requestId, serialized)
    }
  }

  private resolveControlRequest(response: SDKControlResponse): void {
    const requestId = response.response.request_id
    const pending = this.pendingControlRequests.get(requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pendingControlRequests.delete(requestId)
    this.queuedControlRequests.delete(requestId)
    pending.resolve(response)
  }

  private rejectPendingControlRequests(error: Error): void {
    for (const pending of this.pendingControlRequests.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pendingControlRequests.clear()
    this.queuedControlRequests.clear()
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected'
  }

  /**
   * Close the WebSocket connection
   */
  close(): void {
    logForDebugging('[SessionsWebSocket] Closing connection')
    ++this.connectionGeneration
    this.state = 'closed'
    this.stopPingInterval()
    this.rejectPendingControlRequests(
      new Error('Session WebSocket closed before control acknowledgement'),
    )

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      // Null out event handlers to prevent race conditions during reconnect.
      // Under Bun (native WebSocket), onX handlers are the clean way to detach.
      // Under Node (ws package), the listeners were attached with .on() in connect(),
      // but since we're about to close and null out this.ws, no cleanup is needed.
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * Force reconnect - closes existing connection and establishes a new one.
   * Useful when the subscription becomes stale (e.g., after container shutdown).
   */
  reconnect(): void {
    logForDebugging('[SessionsWebSocket] Force reconnecting')
    this.reconnectAttempts = 0
    this.sessionNotFoundRetries = 0
    this.close()
    // Small delay before reconnecting (stored in reconnectTimer so it can be cancelled)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connect()
    }, 500)
  }
}
