import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type {
  SDKControlCancelRequest,
  SDKControlPermissionRequest,
  SDKControlRequest,
  SDKControlResponse,
} from '../entrypoints/sdk/controlTypes.js'
import { logForDebugging } from '../utils/debug.js'
import { logError } from '../utils/log.js'
import {
  type RemoteMessageContent,
  sendEventToRemoteSession,
} from '../utils/teleport/api.js'
import {
  SessionsWebSocket,
  type SessionsWebSocketCallbacks,
} from './SessionsWebSocket.js'

const PENDING_SEND_CANCEL_WAIT_MS = 2_000

type RemoteSessionManagerOptions = {
  /** @internal Allows cancellation tests to use a short deterministic bound. */
  pendingSendCancelWaitMs?: number
  /** @internal Injectable event POST for lifecycle tests. */
  sendEvent?: (
    sessionId: string,
    content: RemoteMessageContent,
    opts?: { uuid?: string; signal?: AbortSignal },
  ) => Promise<boolean>
}

/**
 * Type guard to check if a message is an SDKMessage (not a control message)
 */
function isSDKMessage(
  message:
    | SDKMessage
    | SDKControlRequest
    | SDKControlResponse
    | SDKControlCancelRequest,
): message is SDKMessage {
  return (
    message.type !== 'control_request' &&
    message.type !== 'control_response' &&
    message.type !== 'control_cancel_request'
  )
}

/**
 * Simple permission response for remote sessions.
 * This is a simplified version of PermissionResult for CCR communication.
 */
export type RemotePermissionResponse =
  | {
      behavior: 'allow'
      updatedInput: Record<string, unknown>
    }
  | {
      behavior: 'deny'
      message: string
    }

export type RemoteSessionConfig = {
  sessionId: string
  getAccessToken: () => string
  orgUuid: string
  /** True if session was created with an initial prompt that's being processed */
  hasInitialPrompt?: boolean
  /**
   * When true, this client is a pure viewer. Ctrl+C/Escape do NOT send
   * interrupt to the remote agent; 60s reconnect timeout is disabled;
   * session title is never updated. Used by `claude assistant`.
   */
  viewerOnly?: boolean
}

export type RemoteSessionCallbacks = {
  /** Called when an SDKMessage is received from the session */
  onMessage: (message: SDKMessage) => void
  /** Called when a permission request is received from CCR */
  onPermissionRequest: (
    request: SDKControlPermissionRequest,
    requestId: string,
  ) => void
  /** Called when the server cancels a pending permission request */
  onPermissionCancelled?: (
    requestId: string,
    toolUseId: string | undefined,
  ) => void
  /** Called when connection is established */
  onConnected?: () => void
  /** Called when connection is lost and cannot be restored */
  onDisconnected?: () => void
  /** Called on transient WS drop while reconnect backoff is in progress */
  onReconnecting?: () => void
  /** Called on error */
  onError?: (error: Error) => void
}

/**
 * Manages a remote CCR session.
 *
 * Coordinates:
 * - WebSocket subscription for receiving messages from CCR
 * - HTTP POST for sending user messages to CCR
 * - Permission request/response flow
 */
export class RemoteSessionManager {
  private websocket: SessionsWebSocket | null = null
  private pendingPermissionRequests: Map<string, SDKControlPermissionRequest> =
    new Map()
  private pendingCancellation: Promise<boolean> | null = null
  private pendingSends = new Set<Promise<boolean>>()
  private pendingSendControllers = new Map<Promise<boolean>, AbortController>()
  private disconnected = false
  private disconnectPromise: Promise<boolean> | null = null
  private disconnectNeedsInterrupt = false

  constructor(
    private readonly config: RemoteSessionConfig,
    private readonly callbacks: RemoteSessionCallbacks,
    private readonly options: RemoteSessionManagerOptions = {},
  ) {}

  /**
   * Connect to the remote session via WebSocket
   */
  connect(): void {
    logForDebugging(
      `[RemoteSessionManager] Connecting to session ${this.config.sessionId}`,
    )

    const wsCallbacks: SessionsWebSocketCallbacks = {
      onMessage: message => this.handleMessage(message),
      onConnected: () => {
        logForDebugging('[RemoteSessionManager] Connected')
        this.callbacks.onConnected?.()
      },
      onClose: () => {
        logForDebugging('[RemoteSessionManager] Disconnected')
        this.callbacks.onDisconnected?.()
      },
      onReconnecting: () => {
        logForDebugging('[RemoteSessionManager] Reconnecting')
        this.callbacks.onReconnecting?.()
      },
      onError: error => {
        logError(error)
        this.callbacks.onError?.(error)
      },
    }

    this.websocket = new SessionsWebSocket(
      this.config.sessionId,
      this.config.orgUuid,
      this.config.getAccessToken,
      wsCallbacks,
    )

    void this.websocket.connect()
  }

  /**
   * Handle messages from WebSocket
   */
  private handleMessage(
    message:
      | SDKMessage
      | SDKControlRequest
      | SDKControlResponse
      | SDKControlCancelRequest,
  ): void {
    // Handle control requests (permission prompts from CCR)
    if (message.type === 'control_request') {
      this.handleControlRequest(message as SDKControlRequest)
      return
    }

    // Handle control cancel requests (server cancelling a pending permission prompt)
    if (message.type === 'control_cancel_request') {
      const { request_id } = message as SDKControlCancelRequest
      const pendingRequest = this.pendingPermissionRequests.get(request_id)
      logForDebugging(
        `[RemoteSessionManager] Permission request cancelled: ${request_id}`,
      )
      this.pendingPermissionRequests.delete(request_id)
      this.callbacks.onPermissionCancelled?.(
        request_id,
        pendingRequest?.tool_use_id,
      )
      return
    }

    // Handle control responses (acknowledgments)
    if (message.type === 'control_response') {
      logForDebugging('[RemoteSessionManager] Received control response')
      return
    }

    // Forward SDK messages to callback (type guard ensures proper narrowing)
    if (isSDKMessage(message)) {
      this.callbacks.onMessage(message)
    }
  }

  /**
   * Handle control requests from CCR (e.g., permission requests)
   */
  private handleControlRequest(request: SDKControlRequest): void {
    const requestId = request.request_id as string
    const inner = request.request as SDKControlPermissionRequest

    if (inner.subtype === 'can_use_tool') {
      logForDebugging(
        `[RemoteSessionManager] Permission request for tool: ${inner.tool_name}`,
      )
      this.pendingPermissionRequests.set(requestId, inner)
      this.callbacks.onPermissionRequest(inner, requestId)
    } else {
      // Send an error response for unrecognized subtypes so the server
      // doesn't hang waiting for a reply that never comes.
      logForDebugging(
        `[RemoteSessionManager] Unsupported control request subtype: ${inner.subtype}`,
      )
      const response: SDKControlResponse = {
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: requestId,
          error: `Unsupported control request subtype: ${inner.subtype}`,
        },
      }
      this.websocket?.sendControlResponse(response)
    }
  }

  /**
   * Send a user message to the remote session via HTTP POST
   */
  async sendMessage(
    content: RemoteMessageContent,
    opts?: { uuid?: string },
  ): Promise<boolean> {
    if (this.disconnected) return false
    // Escape can make the UI look idle before the remote worker has handled
    // the interrupt. Do not let the next turn overtake that control request.
    if (this.pendingCancellation) {
      const cancelled = await this.pendingCancellation
      if (!cancelled) return false
    }
    if (this.disconnected) return false

    logForDebugging(
      `[RemoteSessionManager] Sending message to session ${this.config.sessionId}`,
    )

    const abortController = new AbortController()
    const sendEvent = this.options.sendEvent ?? sendEventToRemoteSession
    // Install ownership before invoking the adapter. disconnect() can then
    // abort even a request whose auth preparation has not reached axios yet.
    const send = Promise.resolve().then(() =>
      sendEvent(this.config.sessionId, content, {
        ...opts,
        signal: abortController.signal,
      }),
    )
    this.pendingSends.add(send)
    this.pendingSendControllers.set(send, abortController)
    let success: boolean
    try {
      success = await send
    } finally {
      this.pendingSends.delete(send)
      this.pendingSendControllers.delete(send)
    }

    if (!success) {
      logError(
        new Error(
          `[RemoteSessionManager] Failed to send message to session ${this.config.sessionId}`,
        ),
      )
    }

    return success
  }

  /**
   * Respond to a permission request from CCR
   */
  respondToPermissionRequest(
    requestId: string,
    result: RemotePermissionResponse,
  ): void {
    const pendingRequest = this.pendingPermissionRequests.get(requestId)
    if (!pendingRequest) {
      logError(
        new Error(
          `[RemoteSessionManager] No pending permission request with ID: ${requestId}`,
        ),
      )
      return
    }

    this.pendingPermissionRequests.delete(requestId)

    const response: SDKControlResponse = {
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
    }

    logForDebugging(
      `[RemoteSessionManager] Sending permission response: ${result.behavior}`,
    )

    this.websocket?.sendControlResponse(response)
  }

  /**
   * Check if connected to the remote session
   */
  isConnected(): boolean {
    return this.websocket?.isConnected() ?? false
  }

  /**
   * Send an interrupt signal to cancel the current request on the remote session
   */
  async cancelSession(): Promise<boolean> {
    if (this.pendingCancellation) return this.pendingCancellation

    const cancellation = this.cancelSessionOnce()
    this.pendingCancellation = cancellation
    const releaseCancellation = (): void => {
      if (this.pendingCancellation === cancellation) {
        this.pendingCancellation = null
      }
    }
    // Keep the original cancellation result authoritative. An ignored
    // finally() would manufacture a second unhandled rejection if an
    // unexpected transport error escaped cancelSessionOnce().
    void cancellation.then(releaseCancellation, releaseCancellation)
    return cancellation
  }

  private async cancelSessionOnce(): Promise<boolean> {
    logForDebugging('[RemoteSessionManager] Sending interrupt signal')
    if (!this.websocket) {
      logError(new Error('[RemoteSessionManager] Cannot cancel: no WebSocket'))
      return false
    }
    const websocket = this.websocket
    const requestInterrupt = (): Promise<boolean> =>
      this.requestInterrupt(websocket)

    const sendsInFlight = [...this.pendingSends]
    if (sendsInFlight.length > 0) {
      // HTTP event ingestion and the control WebSocket are independent
      // transports. An interrupt can otherwise be acknowledged before the
      // in-flight POST reaches the worker, allowing inference to start after
      // Stop reported success. Interrupt immediately for responsiveness, then
      // issue a causal final interrupt after every older POST has settled.
      void requestInterrupt()
      const sendSettlement = Promise.allSettled(sendsInFlight)
      const settledBeforeDeadline =
        await this.waitForPendingSends(sendSettlement)
      if (!settledBeforeDeadline) {
        logError(
          new Error(
            '[RemoteSessionManager] Timed out waiting for pending sends before final interrupt',
          ),
        )
        // The immediate interrupt may have arrived before an older HTTP POST.
        // If that POST eventually settles, send one more interrupt, but do not
        // report the current Stop as successful without that final ack.
        void sendSettlement.then(() => requestInterrupt())
        return false
      }
      return requestInterrupt()
    }

    return requestInterrupt()
  }

  private async requestInterrupt(
    websocket: Pick<SessionsWebSocket, 'sendControlRequest'> | null,
  ): Promise<boolean> {
    if (!websocket) return false
    try {
      const response = await websocket.sendControlRequest({
        subtype: 'interrupt',
      })
      if (response.response.subtype === 'success') return true
      logError(
        new Error(
          `[RemoteSessionManager] Interrupt rejected: ${response.response.error}`,
        ),
      )
      return false
    } catch (error) {
      logError(
        error instanceof Error
          ? error
          : new Error('[RemoteSessionManager] Interrupt failed'),
      )
      return false
    }
  }

  private async waitForPendingSends(
    settlement: Promise<unknown>,
  ): Promise<boolean> {
    const timeoutMs =
      this.options.pendingSendCancelWaitMs ?? PENDING_SEND_CANCEL_WAIT_MS
    let timeout: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<false>(resolve => {
      timeout = setTimeout(resolve, timeoutMs, false)
    })
    try {
      return await Promise.race([
        settlement.then(() => true as const),
        deadline,
      ])
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
    }
  }

  /**
   * Get the session ID
   */
  getSessionId(): string {
    return this.config.sessionId
  }

  /**
   * Disconnect from the remote session
   */
  disconnect(): Promise<boolean> {
    if (this.disconnectPromise) return this.disconnectPromise
    logForDebugging('[RemoteSessionManager] Disconnecting')
    this.disconnected = true
    const websocket = this.websocket
    const sendsInFlight = [...this.pendingSends]
    const hasNewInteractiveSends =
      sendsInFlight.length > 0 && !this.config.viewerOnly
    if (hasNewInteractiveSends) this.disconnectNeedsInterrupt = true
    for (const send of sendsInFlight) {
      this.pendingSendControllers
        .get(send)
        ?.abort('remote-session-manager-disconnected')
    }
    this.pendingPermissionRequests.clear()

    const disconnect = (async (): Promise<boolean> => {
      try {
        // A viewer disconnect only detaches its own ingestion request. It must
        // never interrupt an agent that another client is observing.
        if (this.config.viewerOnly) {
          await Promise.allSettled(sendsInFlight)
        } else {
          // If event ingestion raced disconnect, an abort only cancels the
          // client wait; the server may already have accepted the event. Keep
          // the old socket owned until every POST settles, then require a
          // causal final interrupt before releasing this manager.
          if (hasNewInteractiveSends) {
            void this.requestInterrupt(websocket)
          }
          await Promise.allSettled(sendsInFlight)
          if (this.disconnectNeedsInterrupt) {
            const interrupted = await this.requestInterrupt(websocket)
            if (!interrupted) return false
            this.disconnectNeedsInterrupt = false
          }
        }

        websocket?.close()
        if (this.websocket === websocket) this.websocket = null
        return true
      } catch (error) {
        logError(
          error instanceof Error
            ? error
            : new Error('[RemoteSessionManager] Disconnect failed'),
        )
        return false
      }
    })()
    this.disconnectPromise = disconnect
    const releaseDisconnect = (): void => {
      if (this.disconnectPromise === disconnect) {
        this.disconnectPromise = null
      }
    }
    // disconnect() is frequently called from React cleanup and intentionally
    // not awaited there. Preserve the result for explicit observers while
    // preventing an unexpected close implementation throw from going global.
    void disconnect.then(releaseDisconnect, releaseDisconnect)
    return disconnect
  }

  /**
   * Force reconnect the WebSocket.
   * Useful when the subscription becomes stale after container shutdown.
   */
  reconnect(): void {
    logForDebugging('[RemoteSessionManager] Reconnecting WebSocket')
    this.websocket?.reconnect()
  }
}

/**
 * Create a remote session config from OAuth tokens
 */
export function createRemoteSessionConfig(
  sessionId: string,
  getAccessToken: () => string,
  orgUuid: string,
  hasInitialPrompt = false,
  viewerOnly = false,
): RemoteSessionConfig {
  return {
    sessionId,
    getAccessToken,
    orgUuid,
    hasInitialPrompt,
    viewerOnly,
  }
}
