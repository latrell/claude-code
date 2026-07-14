/* eslint-disable eslint-plugin-n/no-unsupported-features/node-builtins */

import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type {
  SDKControlPermissionRequest,
  StdoutMessage,
} from '../entrypoints/sdk/controlTypes.js'
import type { RemotePermissionResponse } from '../remote/RemoteSessionManager.js'
import { logForDebugging } from '../utils/debug.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'
import type { RemoteMessageContent } from '../utils/teleport/api.js'

export type DirectConnectConfig = {
  serverUrl: string
  sessionId: string
  wsUrl: string
  authToken?: string
}

export type DirectConnectCallbacks = {
  onMessage: (message: SDKMessage) => void
  onPermissionRequest: (
    request: SDKControlPermissionRequest,
    requestId: string,
  ) => void
  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (error: Error) => void
}

const INTERRUPT_ACK_TIMEOUT_MS = 10_000

function isStdoutMessage(value: unknown): value is StdoutMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}

export class DirectConnectSessionManager {
  private ws: WebSocket | null = null
  private config: DirectConnectConfig
  private callbacks: DirectConnectCallbacks
  private pendingInterrupt: Promise<boolean> | null = null
  private pendingInterrupts = new Map<
    string,
    {
      resolve: (confirmed: boolean) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  constructor(config: DirectConnectConfig, callbacks: DirectConnectCallbacks) {
    this.config = config
    this.callbacks = callbacks
  }

  connect(): void {
    const headers: Record<string, string> = {}
    if (this.config.authToken) {
      headers['authorization'] = `Bearer ${this.config.authToken}`
    }
    // Bun's WebSocket supports headers option but the DOM typings don't
    this.ws = new WebSocket(this.config.wsUrl, {
      headers,
    } as unknown as string[])

    this.ws.addEventListener('open', () => {
      this.callbacks.onConnected?.()
    })

    this.ws.addEventListener('message', event => {
      const data = typeof event.data === 'string' ? event.data : ''
      const lines = data.split('\n').filter((l: string) => l.trim())

      for (const line of lines) {
        let raw: unknown
        try {
          raw = jsonParse(line)
        } catch {
          continue
        }

        if (!isStdoutMessage(raw)) {
          continue
        }
        const parsed = raw

        if (parsed.type === 'control_response') {
          this.handleControlResponse(raw)
          continue
        }

        // Handle control requests (permission requests)
        if (parsed.type === 'control_request') {
          if (parsed.request.subtype === 'can_use_tool') {
            this.callbacks.onPermissionRequest(
              parsed.request,
              parsed.request_id,
            )
          } else {
            // Send an error response for unrecognized subtypes so the
            // server doesn't hang waiting for a reply that never comes.
            logForDebugging(
              `[DirectConnect] Unsupported control request subtype: ${parsed.request.subtype}`,
            )
            this.sendErrorResponse(
              parsed.request_id,
              `Unsupported control request subtype: ${parsed.request.subtype}`,
            )
          }
          continue
        }

        // Forward SDK messages (assistant, result, system, etc.)
        if (
          parsed.type !== 'keep_alive' &&
          parsed.type !== 'control_cancel_request' &&
          parsed.type !== 'streamlined_text' &&
          parsed.type !== 'streamlined_tool_use_summary' &&
          !(parsed.type === 'system' && parsed.subtype === 'post_turn_summary')
        ) {
          this.callbacks.onMessage(parsed)
        }
      }
    })

    this.ws.addEventListener('close', () => {
      this.rejectPendingInterrupts()
      this.callbacks.onDisconnected?.()
    })

    this.ws.addEventListener('error', () => {
      this.rejectPendingInterrupts()
      this.callbacks.onError?.(new Error('WebSocket connection error'))
    })
  }

  async sendMessage(content: RemoteMessageContent): Promise<boolean> {
    if (this.pendingInterrupt) {
      const confirmed = await this.pendingInterrupt
      if (!confirmed) return false
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false
    }

    // Must match SDKUserMessage format expected by `--input-format stream-json`
    const message = jsonStringify({
      type: 'user',
      message: {
        role: 'user',
        content: content,
      },
      parent_tool_use_id: null,
      session_id: '',
    })
    this.ws.send(message)
    return true
  }

  respondToPermissionRequest(
    requestId: string,
    result: RemotePermissionResponse,
  ): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    // Must match SDKControlResponse format expected by StructuredIO
    const response = jsonStringify({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: result.behavior,
          ...(result.behavior === 'allow'
            ? { updatedInput: result.updatedInput }
            : { message: result.message }),
        },
      },
    })
    this.ws.send(response)
  }

  /**
   * Send an interrupt signal to cancel the current request
   */
  sendInterrupt(): Promise<boolean> {
    if (this.pendingInterrupt) return this.pendingInterrupt
    const pending = this.sendInterruptOnce()
    this.pendingInterrupt = pending
    void pending.then(
      () => {
        if (this.pendingInterrupt === pending) this.pendingInterrupt = null
      },
      () => {
        if (this.pendingInterrupt === pending) this.pendingInterrupt = null
      },
    )
    return pending
  }

  private sendInterruptOnce(): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve(false)
    }

    const requestId = crypto.randomUUID()
    // Must match SDKControlRequest format expected by StructuredIO
    const request = jsonStringify({
      type: 'control_request',
      request_id: requestId,
      request: {
        subtype: 'interrupt',
      },
    })

    return new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        this.pendingInterrupts.delete(requestId)
        resolve(false)
      }, INTERRUPT_ACK_TIMEOUT_MS)
      this.pendingInterrupts.set(requestId, { resolve, timer })
      try {
        this.ws?.send(request)
      } catch {
        clearTimeout(timer)
        this.pendingInterrupts.delete(requestId)
        resolve(false)
      }
    })
  }

  private handleControlResponse(value: unknown): void {
    if (typeof value !== 'object' || value === null || !('response' in value)) {
      return
    }
    const response = value.response
    if (
      typeof response !== 'object' ||
      response === null ||
      !('request_id' in response) ||
      typeof response.request_id !== 'string'
    ) {
      return
    }
    const pending = this.pendingInterrupts.get(response.request_id)
    if (!pending) return
    this.pendingInterrupts.delete(response.request_id)
    clearTimeout(pending.timer)
    pending.resolve('subtype' in response && response.subtype === 'success')
  }

  private rejectPendingInterrupts(): void {
    for (const pending of this.pendingInterrupts.values()) {
      clearTimeout(pending.timer)
      pending.resolve(false)
    }
    this.pendingInterrupts.clear()
  }

  private sendErrorResponse(requestId: string, error: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    const response = jsonStringify({
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: requestId,
        error,
      },
    })
    this.ws.send(response)
  }

  disconnect(): void {
    this.rejectPendingInterrupts()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
