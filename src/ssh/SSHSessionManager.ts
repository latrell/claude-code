import type { Subprocess } from 'bun'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type {
  SDKControlPermissionRequest,
  StdoutMessage,
} from '../entrypoints/sdk/controlTypes.js'
import type { PermissionUpdate } from '../types/permissions.js'
import { logForDebugging } from '../utils/debug.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'
import type { RemoteMessageContent } from '../utils/teleport/api.js'
import {
  SSHProcessTerminationError,
  terminateSSHProcess,
} from './terminateSSHProcess.js'

export interface SSHSessionManagerOptions {
  onMessage: (sdkMessage: SDKMessage) => void
  onPermissionRequest: (
    request: SSHPermissionRequest,
    requestId: string,
  ) => void
  onConnected: () => void
  onReconnecting: (attempt: number, max: number) => void
  onDisconnected: () => void
  onError: (error: Error) => void
  reconnect?: (signal?: AbortSignal) => Promise<Subprocess>
  maxReconnectAttempts?: number
}

export interface SSHPermissionRequest {
  tool_name: string
  tool_use_id: string
  description?: string
  permission_suggestions?: PermissionUpdate[]
  blocked_path?: string
  input: { [key: string]: unknown }
}

export interface SSHSessionManager {
  connect(): void
  disconnect(): Promise<boolean>
  sendMessage(content: RemoteMessageContent): Promise<boolean>
  sendInterrupt(): Promise<boolean>
  respondToPermissionRequest(
    requestId: string,
    response: { behavior: string; message?: string; updatedInput?: unknown },
  ): void
}

function isStdoutMessage(value: unknown): value is StdoutMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string'
  )
}

const BASE_RECONNECT_DELAY_MS = 2_000
const MAX_RECONNECT_DELAY_MS = 15_000
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 3
const INTERRUPT_ACK_TIMEOUT_MS = 10_000
const DISCONNECT_SETTLEMENT_TIMEOUT_MS = 5_000

export type SSHProcessTerminator = (proc: Subprocess) => Promise<boolean>

export class SSHSessionManagerImpl implements SSHSessionManager {
  private proc: Subprocess
  private options: SSHSessionManagerOptions
  private connected = false
  private disconnected = false
  private readonly readLoopAbort = new AbortController()
  private readonly reconnectAbort = new AbortController()
  private readonly readers = new Set<ReadableStreamDefaultReader<Uint8Array>>()
  private readonly readLoops = new Set<Promise<void>>()
  private reconnectAttempt = 0
  private readonly maxReconnectAttempts: number
  private userInitiatedDisconnect = false
  private reconnecting = false
  private reconnectSettlement: Promise<void> | null = null
  private disconnectPromise: Promise<boolean> | null = null
  private readonly terminateProcess: SSHProcessTerminator
  private readonly unconfirmedProcesses = new Set<Subprocess>()
  private readonly confirmedTerminatedProcesses = new WeakSet<Subprocess>()
  private pendingInterrupt: Promise<boolean> | null = null
  private pendingInterrupts = new Map<
    string,
    {
      resolve: (confirmed: boolean) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()

  constructor(
    proc: Subprocess,
    options: SSHSessionManagerOptions,
    terminateProcess: SSHProcessTerminator = terminateSSHProcess,
  ) {
    this.proc = proc
    this.options = options
    this.terminateProcess = terminateProcess
    this.maxReconnectAttempts =
      options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS
  }

  connect(): void {
    if (this.connected || this.userInitiatedDisconnect || this.disconnected)
      return

    this.startReadLoop()
    this.monitorExit()

    this.connected = true
    this.options.onConnected()
  }

  private startReadLoop(): void {
    const proc = this.proc
    const loop = this.runReadLoop(proc)
    this.readLoops.add(loop)
    void loop.then(
      () => this.readLoops.delete(loop),
      () => this.readLoops.delete(loop),
    )
  }

  private async runReadLoop(proc: Subprocess): Promise<void> {
    const stdout = proc.stdout
    if (!stdout) {
      this.options.onError(new Error('SSH process stdout is not available'))
      return
    }

    const reader = (stdout as ReadableStream<Uint8Array>).getReader()
    this.readers.add(reader)
    const decoder = new TextDecoder()
    let lineBuffer = ''

    const cancelReader = (): void => {
      void reader.cancel().catch(() => {
        // Process termination may close the stream before cancellation lands.
      })
    }
    this.readLoopAbort.signal.addEventListener('abort', cancelReader, {
      once: true,
    })

    try {
      while (!this.userInitiatedDisconnect && !this.disconnected) {
        const { done, value } = await reader.read()
        if (done) break

        lineBuffer += decoder.decode(value, { stream: true })
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          this.processLine(trimmed)
        }
      }
    } catch (err) {
      if (!this.disconnected) {
        this.options.onError(
          err instanceof Error ? err : new Error(String(err)),
        )
      }
    } finally {
      this.readLoopAbort.signal.removeEventListener('abort', cancelReader)
      this.readers.delete(reader)
      try {
        reader.releaseLock()
      } catch {
        // A concurrently-cancelled reader may already have released its lock.
      }
      if (!this.disconnected && !this.userInitiatedDisconnect) {
        void this.handleProcessExit()
      }
    }
  }

  private monitorExit(): void {
    if (this.proc.exitCode !== null) {
      if (!this.userInitiatedDisconnect) {
        void this.handleProcessExit()
      }
      return
    }
    this.proc.exited
      .then(() => {
        if (!this.disconnected && !this.userInitiatedDisconnect) {
          void this.handleProcessExit()
        }
      })
      .catch(() => {
        if (!this.disconnected && !this.userInitiatedDisconnect) {
          void this.handleProcessExit()
        }
      })
  }

  private async handleProcessExit(): Promise<void> {
    if (this.disconnected || this.reconnecting) return
    this.rejectPendingInterrupts()
    this.connected = false

    if (!this.options.reconnect) {
      this.disconnected = true
      this.options.onDisconnected()
      return
    }

    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      this.disconnected = true
      this.options.onDisconnected()
      return
    }

    this.reconnecting = true
    const settlement = this.attemptReconnect()
    this.reconnectSettlement = settlement
    try {
      await settlement
    } finally {
      if (this.reconnectSettlement === settlement) {
        this.reconnectSettlement = null
      }
      this.reconnecting = false
    }
  }

  private async attemptReconnect(): Promise<void> {
    const reconnect = this.options.reconnect!

    while (this.reconnectAttempt < this.maxReconnectAttempts) {
      this.reconnectAttempt++
      this.options.onReconnecting(
        this.reconnectAttempt,
        this.maxReconnectAttempts,
      )

      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * 2 ** (this.reconnectAttempt - 1),
        MAX_RECONNECT_DELAY_MS,
      )
      if (!(await this.waitForReconnectDelay(delay))) return

      try {
        const newProc = await reconnect(this.reconnectAbort.signal)
        this.proc = newProc
        if (this.userInitiatedDisconnect) {
          const confirmed = await this.terminateOwnedProcess(newProc)
          if (!confirmed) {
            this.options.onError(
              new Error(
                'Late SSH reconnect process termination could not be confirmed',
              ),
            )
          }
          return
        }
        this.reconnectAttempt = 0
        this.connected = true
        this.startReadLoop()
        this.monitorExit()
        this.options.onConnected()
        return
      } catch (err) {
        if (err instanceof SSHProcessTerminationError) {
          this.unconfirmedProcesses.add(err.proc)
        }
        if (this.userInitiatedDisconnect) return
        logForDebugging(
          `[SSH] reconnect attempt ${this.reconnectAttempt} failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    this.disconnected = true
    this.options.onDisconnected()
  }

  private waitForReconnectDelay(delay: number): Promise<boolean> {
    if (this.reconnectAbort.signal.aborted) return Promise.resolve(false)

    return new Promise<boolean>(resolve => {
      let settled = false
      const finish = (elapsed: boolean): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.reconnectAbort.signal.removeEventListener('abort', onAbort)
        resolve(elapsed)
      }
      const onAbort = (): void => finish(false)
      const timer = setTimeout(() => finish(true), delay)
      this.reconnectAbort.signal.addEventListener('abort', onAbort, {
        once: true,
      })
    })
  }

  private processLine(line: string): void {
    let raw: unknown
    try {
      raw = jsonParse(line)
    } catch {
      return
    }

    if (!isStdoutMessage(raw)) return
    const parsed = raw

    if (parsed.type === 'control_response') {
      this.handleControlResponse(raw)
      return
    }

    if (parsed.type === 'control_request') {
      const request = parsed as unknown as {
        request_id: string
        request: SDKControlPermissionRequest & { subtype: string }
      }
      if (request.request.subtype === 'can_use_tool') {
        this.options.onPermissionRequest(
          request.request as unknown as SSHPermissionRequest,
          request.request_id,
        )
      } else {
        logForDebugging(
          `[SSH] Unsupported control request subtype: ${request.request.subtype}`,
        )
        this.sendErrorResponse(
          request.request_id,
          `Unsupported control request subtype: ${request.request.subtype}`,
        )
      }
      return
    }

    if (
      parsed.type !== 'keep_alive' &&
      parsed.type !== 'control_cancel_request' &&
      parsed.type !== 'streamlined_text' &&
      parsed.type !== 'streamlined_tool_use_summary' &&
      !(
        parsed.type === 'system' &&
        (parsed as Record<string, unknown>).subtype === 'post_turn_summary'
      )
    ) {
      this.options.onMessage(parsed as SDKMessage)
    }
  }

  private writeToStdin(data: string): boolean {
    try {
      const stdin = this.proc.stdin
      if (
        !stdin ||
        typeof stdin === 'number' ||
        this.disconnected ||
        this.userInitiatedDisconnect
      )
        return false
      const encoded = new TextEncoder().encode(data + '\n')
      ;(stdin as unknown as { write(d: Uint8Array): number }).write(encoded)
      ;(stdin as unknown as { flush?(): void }).flush?.()
      return true
    } catch {
      return false
    }
  }

  async sendMessage(content: RemoteMessageContent): Promise<boolean> {
    if (this.pendingInterrupt) {
      const confirmed = await this.pendingInterrupt
      if (!confirmed) return false
    }

    const message = jsonStringify({
      type: 'user',
      message: {
        role: 'user',
        content,
      },
      parent_tool_use_id: null,
      session_id: '',
    })
    return this.writeToStdin(message)
  }

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
    if (!this.connected || this.disconnected) return Promise.resolve(false)

    const requestId = crypto.randomUUID()
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
      if (!this.writeToStdin(request)) {
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

  respondToPermissionRequest(
    requestId: string,
    response: { behavior: string; message?: string; updatedInput?: unknown },
  ): void {
    const msg = jsonStringify({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: response.behavior,
          ...(response.behavior === 'allow'
            ? { updatedInput: response.updatedInput }
            : { message: response.message }),
        },
      },
    })
    this.writeToStdin(msg)
  }

  private sendErrorResponse(requestId: string, error: string): void {
    const response = jsonStringify({
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: requestId,
        error,
      },
    })
    this.writeToStdin(response)
  }

  disconnect(): Promise<boolean> {
    if (this.disconnected) return Promise.resolve(true)
    if (this.disconnectPromise) return this.disconnectPromise

    const pending = this.disconnectOnce()
    this.disconnectPromise = pending
    void pending.then(
      confirmed => {
        if (confirmed) {
          this.disconnected = true
        } else if (this.disconnectPromise === pending) {
          // Preserve the process reference and permit a retry when termination
          // could not be proven.
          this.disconnectPromise = null
        }
      },
      () => {
        if (this.disconnectPromise === pending) this.disconnectPromise = null
      },
    )
    return pending
  }

  private async disconnectOnce(): Promise<boolean> {
    this.userInitiatedDisconnect = true
    this.connected = false
    this.reconnectAbort.abort()
    this.readLoopAbort.abort()
    this.rejectPendingInterrupts()

    const processes = new Set<Subprocess>(this.unconfirmedProcesses)
    const terminationAttempts = new Map<Subprocess, Promise<boolean>>()
    const rememberCurrentProcess = (): void => {
      processes.add(this.proc)
    }
    const startTerminationAttempts = (): void => {
      for (const proc of processes) {
        if (!terminationAttempts.has(proc)) {
          terminationAttempts.set(proc, this.terminateOwnedProcess(proc))
        }
      }
    }
    rememberCurrentProcess()
    this.closeProcessStdin(this.proc)
    const readerCancellations = Promise.allSettled(
      [...this.readers].map(reader => reader.cancel()),
    )
    const readLoopSettlements = [...this.readLoops]
    startTerminationAttempts()

    try {
      // A reconnect may already be inside its spawn/init callback. Aborting
      // prevents further retries; awaiting it ensures a late process is also
      // included in this disconnect attempt.
      const reconnectSettled = await this.waitForSettlement(
        this.reconnectSettlement,
        DISCONNECT_SETTLEMENT_TIMEOUT_MS,
      )
      rememberCurrentProcess()
      for (const proc of processes) this.closeProcessStdin(proc)
      startTerminationAttempts()

      const [results, readLoopsSettled] = await Promise.all([
        Promise.all(terminationAttempts.values()),
        this.waitForSettlement(
          Promise.allSettled([readerCancellations, ...readLoopSettlements]),
          DISCONNECT_SETTLEMENT_TIMEOUT_MS,
        ),
      ])
      const confirmed =
        reconnectSettled && readLoopsSettled && results.every(Boolean)
      if (!confirmed) {
        const incomplete = [
          !reconnectSettled ? 'reconnect callback' : null,
          !readLoopsSettled ? 'stdout read loop' : null,
          !results.every(Boolean) ? 'process tree' : null,
        ].filter((part): part is string => part !== null)
        this.options.onError(
          new Error(
            `SSH disconnect could not confirm settlement of: ${incomplete.join(', ')}`,
          ),
        )
      }
      return confirmed
    } catch (error) {
      this.options.onError(
        error instanceof Error ? error : new Error(String(error)),
      )
      return false
    }
  }

  private async terminateOwnedProcess(proc: Subprocess): Promise<boolean> {
    if (this.confirmedTerminatedProcesses.has(proc)) return true

    try {
      const confirmed = await this.terminateProcess(proc)
      if (confirmed) {
        this.confirmedTerminatedProcesses.add(proc)
        this.unconfirmedProcesses.delete(proc)
      } else {
        this.unconfirmedProcesses.add(proc)
      }
      return confirmed
    } catch {
      this.unconfirmedProcesses.add(proc)
      return false
    }
  }

  private async waitForSettlement(
    settlement: Promise<unknown> | null,
    timeoutMs: number,
  ): Promise<boolean> {
    if (!settlement) return true

    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        settlement.then(
          () => true,
          () => true,
        ),
        new Promise<boolean>(resolve => {
          timer = setTimeout(() => resolve(false), timeoutMs)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private closeProcessStdin(proc: Subprocess): void {
    try {
      const stdin = proc.stdin
      if (stdin && typeof stdin !== 'number') {
        ;(stdin as unknown as { end?(): void }).end?.()
      }
    } catch {
      // stdin may already be closed
    }
  }

  isConnected(): boolean {
    return this.connected && !this.disconnected
  }
}
