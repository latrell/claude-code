import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BoundedUUIDSet } from '../bridge/bridgeMessaging.js'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import type { SpinnerMode } from '../components/Spinner/types.js'
import {
  type RemotePermissionResponse,
  type RemoteSessionConfig,
  RemoteSessionManager,
} from '../remote/RemoteSessionManager.js'
import {
  createSyntheticAssistantMessage,
  createToolStub,
} from '../remote/remotePermissionBridge.js'
import {
  convertSDKMessage,
  isSessionEndMessage,
} from '../remote/sdkMessageAdapter.js'
import { useSetAppState } from '../state/AppState.js'
import type { AppState } from '../state/AppStateStore.js'
import type { Tool } from '../Tool.js'
import { findToolByName } from '../Tool.js'
import type { Message as MessageType } from '../types/message.js'
import type {
  PermissionAskDecision,
  PermissionUpdate,
} from '../types/permissions.js'
import { logForDebugging } from '../utils/debug.js'
import { truncateToWidth } from '../utils/format.js'
import { t, tf } from '../i18n/t.js'
import {
  createSystemMessage,
  extractTextContent,
  handleMessageFromStream,
  type StreamingToolUse,
} from '../utils/messages.js'
import { generateSessionTitle } from '../utils/sessionTitle.js'
import { StopConfirmationError } from '../utils/stopConfirmation.js'
import type { RemoteMessageContent } from '../utils/teleport/api.js'
import { updateSessionTitle } from '../utils/teleport/api.js'
import {
  canPublishRemoteSessionIdle,
  canRetryRemoteTitleAfterCancellation,
  hasCancelableRemoteTitleWork,
  RemoteTitleOwnership,
  type RemoteTitleRun,
  resolveRemoteCancellationOutcome,
} from '../remote/remoteTitleLifecycle.js'
import {
  beginRemoteSessionCallbackGeneration,
  invalidateRemoteSessionCallbacks,
  resetRemoteSessionLifecycle,
} from '../remote/remoteSessionLifecycle.js'

// How long to wait for a response before showing a warning
const RESPONSE_TIMEOUT_MS = 60000 // 60 seconds
// Extended timeout during compaction — compact API calls take 5-30s and
// block other SDK messages, so the normal 60s timeout isn't enough when
// compaction itself runs close to the edge.
const COMPACTION_TIMEOUT_MS = 180000 // 3 minutes

type UseRemoteSessionProps = {
  config: RemoteSessionConfig | undefined
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>
  setIsLoading: (loading: boolean) => void
  onInit?: (slashCommands: string[]) => void
  setToolUseConfirmQueue: React.Dispatch<React.SetStateAction<ToolUseConfirm[]>>
  tools: Tool[]
  setStreamingToolUses?: React.Dispatch<
    React.SetStateAction<StreamingToolUse[]>
  >
  setStreamMode?: React.Dispatch<React.SetStateAction<SpinnerMode>>
  setInProgressToolUseIDs?: (f: (prev: Set<string>) => Set<string>) => void
}

type UseRemoteSessionResult = {
  isRemoteMode: boolean
  /** Auxiliary title inference can be stopped without keeping the main spinner active. */
  hasCancelableAuxiliaryWork: boolean
  sendMessage: (
    content: RemoteMessageContent,
    opts?: { uuid?: string },
  ) => Promise<boolean>
  cancelRequest: () => void
  disconnect: () => void
}

/**
 * Hook for managing a remote CCR session in the REPL.
 *
 * Handles:
 * - WebSocket connection to CCR
 * - Converting SDK messages to REPL messages
 * - Sending user input to CCR via HTTP POST
 * - Permission request/response flow via existing ToolUseConfirm queue
 */
export function useRemoteSession({
  config,
  setMessages,
  setIsLoading,
  onInit,
  setToolUseConfirmQueue,
  tools,
  setStreamingToolUses,
  setStreamMode,
  setInProgressToolUseIDs,
}: UseRemoteSessionProps): UseRemoteSessionResult {
  const isRemoteMode = !!config

  const setAppState = useSetAppState()
  const setConnStatus = useCallback(
    (s: AppState['remoteConnectionStatus']) =>
      setAppState(prev =>
        prev.remoteConnectionStatus === s
          ? prev
          : { ...prev, remoteConnectionStatus: s },
      ),
    [setAppState],
  )

  // Event-sourced count of subagents running inside the remote daemon child.
  // The viewer's own AppState.tasks is empty — tasks live in a different
  // process. task_started/task_notification reach us via the bridge WS.
  const runningTaskIdsRef = useRef(new Set<string>())
  const writeTaskCount = useCallback(() => {
    const n = runningTaskIdsRef.current.size
    setAppState(prev =>
      prev.remoteBackgroundTaskCount === n
        ? prev
        : { ...prev, remoteBackgroundTaskCount: n },
    )
  }, [setAppState])

  // Timer for detecting stuck sessions
  const responseTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Track whether the remote session is compacting. During compaction the
  // CLI worker is busy with an API call and won't emit messages for a while;
  // use a longer timeout and suppress spurious "unresponsive" warnings.
  const isCompactingRef = useRef(false)

  const managerRef = useRef<RemoteSessionManager | null>(null)
  const retiredManagersRef = useRef(new Set<RemoteSessionManager>())
  const retiredManagerDisconnectsRef = useRef(
    new Map<RemoteSessionManager, Promise<boolean>>(),
  )
  const managerCallbackGenerationRef = useRef(0)
  const cancellationPendingRef = useRef(false)
  const cancellationGenerationRef = useRef(0)
  const remoteCancellationUnconfirmedRef = useRef(false)
  const remoteTurnActiveRef = useRef(config?.hasInitialPrompt ?? false)
  const cancellationWarningShownRef = useRef(false)

  // Track whether we've already updated the session title (for no-initial-prompt sessions)
  const hasUpdatedTitleRef = useRef(false)
  const titleOwnershipRef = useRef(new RemoteTitleOwnership())
  const observedTitleCancellationRef = useRef<Promise<boolean> | null>(null)
  const titleCancellationUnconfirmedRef = useRef(false)
  const [hasCancelableAuxiliaryWork, setHasCancelableAuxiliaryWork] =
    useState(false)
  const syncAuxiliaryStopAvailability = useCallback(() => {
    setHasCancelableAuxiliaryWork(
      hasCancelableRemoteTitleWork({
        titleRunActive: titleOwnershipRef.current.hasActiveOwner,
      }),
    )
  }, [])
  const remotePermissionIdsRef = useRef(new Set<string>())

  const clearRemotePermissions = useCallback(() => {
    if (remotePermissionIdsRef.current.size === 0) return
    const ids = new Set(remotePermissionIdsRef.current)
    remotePermissionIdsRef.current.clear()
    setToolUseConfirmQueue(queue =>
      queue.filter(item => !ids.has(item.toolUseID)),
    )
  }, [setToolUseConfirmQueue])

  const resetRemoteLifecycle = useCallback(
    (
      reason: unknown,
      next: Readonly<{
        remoteTurnActive?: boolean
        titleOwnerActive?: boolean
        managerOwnerActive?: boolean
      }> = {},
    ): void => {
      logForDebugging(
        `[useRemoteSession] Resetting main lifecycle: ${String(reason)}`,
      )
      invalidateRemoteSessionCallbacks(managerCallbackGenerationRef)
      resetRemoteSessionLifecycle(
        {
          cancellationPending: cancellationPendingRef,
          cancellationGeneration: cancellationGenerationRef,
          remoteCancellationUnconfirmed: remoteCancellationUnconfirmedRef,
          remoteTurnActive: remoteTurnActiveRef,
          cancellationWarningShown: cancellationWarningShownRef,
          isCompacting: isCompactingRef,
          hasUpdatedTitle: hasUpdatedTitleRef,
          responseTimeout: responseTimeoutRef,
        },
        setIsLoading,
        next,
      )
      clearRemotePermissions()
      runningTaskIdsRef.current.clear()
      writeTaskCount()
      setInProgressToolUseIDs?.(prev => (prev.size > 0 ? new Set() : prev))
      setConnStatus('disconnected')
    },
    [
      clearRemotePermissions,
      setConnStatus,
      setInProgressToolUseIDs,
      setIsLoading,
      writeTaskCount,
    ],
  )

  const reportUnconfirmedStop = useCallback(() => {
    if (cancellationWarningShownRef.current) return
    cancellationWarningShownRef.current = true
    setMessages(prev => [
      ...prev,
      createSystemMessage(
        t('Remote request could not be confirmed as stopped.'),
        'warning',
      ),
    ])
  }, [setMessages])

  const retireRemoteManager = useCallback(
    (manager: RemoteSessionManager): Promise<boolean> => {
      const existing = retiredManagerDisconnectsRef.current.get(manager)
      if (existing) return existing

      retiredManagersRef.current.add(manager)
      setIsLoading(true)
      const disconnect = manager.disconnect()
      let observed: Promise<boolean>
      const finish = (confirmed: boolean): boolean => {
        if (retiredManagerDisconnectsRef.current.get(manager) !== observed) {
          return confirmed
        }
        retiredManagerDisconnectsRef.current.delete(manager)
        if (confirmed) retiredManagersRef.current.delete(manager)
        else reportUnconfirmedStop()

        if (retiredManagersRef.current.size > 0) {
          setIsLoading(true)
        } else if (
          canPublishRemoteSessionIdle({
            remoteTurnActive: remoteTurnActiveRef.current,
            titleRunActive: titleOwnershipRef.current.hasActiveOwner,
            managerDisconnectActive: false,
            cancellationPending: cancellationPendingRef.current,
            remoteCancellationUnconfirmed:
              remoteCancellationUnconfirmedRef.current,
            titleCancellationUnconfirmed:
              titleCancellationUnconfirmedRef.current,
          })
        ) {
          setIsLoading(false)
        }
        return confirmed
      }
      observed = disconnect.then(finish, () => finish(false))
      retiredManagerDisconnectsRef.current.set(manager, observed)
      void observed.catch(() => {})
      return observed
    },
    [reportUnconfirmedStop, setIsLoading],
  )

  const retireRemoteTitle = useCallback(
    (reason: unknown): void => {
      const ownership = titleOwnershipRef.current
      const cancellation = ownership.cancel(reason)
      if (!cancellation) return

      // Title work remains separately Stop-routable, but it is auxiliary and
      // must not keep a completed main worker turn in the loading state.
      syncAuxiliaryStopAvailability()
      if (observedTitleCancellationRef.current === cancellation) return
      observedTitleCancellationRef.current = cancellation
      void cancellation.then(confirmed => {
        if (observedTitleCancellationRef.current !== cancellation) return
        observedTitleCancellationRef.current = null
        titleCancellationUnconfirmedRef.current = ownership.hasUnconfirmedStop
        syncAuxiliaryStopAvailability()
        if (!confirmed) reportUnconfirmedStop()
        if (
          canPublishRemoteSessionIdle({
            remoteTurnActive: remoteTurnActiveRef.current,
            titleRunActive: ownership.hasActiveOwner,
            managerDisconnectActive: retiredManagersRef.current.size > 0,
            cancellationPending: cancellationPendingRef.current,
            remoteCancellationUnconfirmed:
              remoteCancellationUnconfirmedRef.current,
            titleCancellationUnconfirmed:
              titleCancellationUnconfirmedRef.current,
          })
        ) {
          setIsLoading(false)
        }
      })
    },
    [reportUnconfirmedStop, setIsLoading, syncAuxiliaryStopAvailability],
  )

  // UUIDs of user messages we POSTed locally — the WS echoes them back and
  // we must filter them out when convertUserTextMessages is on, or the viewer
  // sees every typed message twice (once from local createUserMessage, once
  // from the echo). A single POST can echo MULTIPLE times with the same uuid:
  // the server may broadcast the POST directly to /subscribe, AND the worker
  // (cowork desktop / CLI daemon) echoes it again on its write path. A
  // delete-on-first-match Set would let the second echo through — use a
  // bounded ring instead. Cap is generous: users don't type 50 messages
  // faster than echoes arrive.
  // NOTE: this does NOT dedup history-vs-live overlap at attach time (nothing
  // seeds the set from history UUIDs; only sendMessage populates it).
  const sentUUIDsRef = useRef(new BoundedUUIDSet(50))

  // Keep a ref to tools so the WebSocket callback doesn't go stale
  const toolsRef = useRef(tools)
  useEffect(() => {
    toolsRef.current = tools
  }, [tools])

  // Initialize and connect to remote session
  useEffect(() => {
    // Skip if not in remote mode
    if (!config) {
      const staleManager = managerRef.current
      managerRef.current = null
      if (staleManager) void retireRemoteManager(staleManager)
      retireRemoteTitle('remote-session-config-cleared')
      resetRemoteLifecycle('remote-session-config-cleared', {
        titleOwnerActive: titleOwnershipRef.current.hasActiveOwner,
        managerOwnerActive: retiredManagersRef.current.size > 0,
      })
      return
    }

    // Normalize state inherited from config A before config B installs its
    // callback epoch. A title owned by A is retired separately and remains a
    // loading owner until its bounded cancellation result is known.
    retireRemoteTitle('remote-session-config-replaced')
    resetRemoteLifecycle('remote-session-config-replaced', {
      remoteTurnActive: config.hasInitialPrompt ?? false,
      titleOwnerActive: titleOwnershipRef.current.hasActiveOwner,
      managerOwnerActive: retiredManagersRef.current.size > 0,
    })
    const isCurrentManagerCallback = beginRemoteSessionCallbackGeneration(
      managerCallbackGenerationRef,
    )

    remoteCancellationUnconfirmedRef.current = false
    cancellationWarningShownRef.current = false
    hasUpdatedTitleRef.current = false
    titleCancellationUnconfirmedRef.current =
      titleOwnershipRef.current.hasUnconfirmedStop

    logForDebugging(
      `[useRemoteSession] Initializing for session ${config.sessionId}`,
    )

    const manager = new RemoteSessionManager(config, {
      onMessage: sdkMessage => {
        if (!isCurrentManagerCallback()) return
        const parts = [`type=${sdkMessage.type}`]
        if ('subtype' in sdkMessage)
          parts.push(`subtype=${sdkMessage.subtype as string}`)
        if (sdkMessage.type === 'user') {
          const c = (sdkMessage.message as { content?: unknown } | undefined)
            ?.content
          parts.push(
            `content=${Array.isArray(c) ? c.map(b => b.type).join(',') : typeof c}`,
          )
        }
        logForDebugging(`[useRemoteSession] Received ${parts.join(' ')}`)

        // Clear response timeout on any message received — including the WS
        // echo of our own POST, which acts as a heartbeat. This must run
        // BEFORE the echo filter, or slow-to-stream agents (compaction, cold
        // start) spuriously trip the 60s unresponsive warning + reconnect.
        if (responseTimeoutRef.current) {
          clearTimeout(responseTimeoutRef.current)
          responseTimeoutRef.current = null
        }

        // Echo filter: drop user messages we already added locally before POST.
        // The server and/or worker round-trip our own send back on the WS with
        // the same uuid we passed to sendEventToRemoteSession. DO NOT delete on
        // match — the same uuid can echo more than once (server broadcast +
        // worker echo), and BoundedUUIDSet already caps growth via its ring.
        if (
          sdkMessage.type === 'user' &&
          sdkMessage.uuid &&
          sentUUIDsRef.current.has(sdkMessage.uuid as string)
        ) {
          logForDebugging(
            `[useRemoteSession] Dropping echoed user message ${sdkMessage.uuid as string}`,
          )
          return
        }
        // Handle init message - extract available slash commands
        if (
          sdkMessage.type === 'system' &&
          sdkMessage.subtype === 'init' &&
          onInit
        ) {
          const slashCommands = sdkMessage.slash_commands as string[]
          logForDebugging(
            `[useRemoteSession] Init received with ${slashCommands.length} slash commands`,
          )
          onInit(slashCommands)
        }

        // Track remote subagent lifecycle for the "N in background" counter.
        // All task types (Agent/teammate/workflow/bash) flow through
        // registerTask() → task_started, and complete via task_notification.
        // Return early — these are status signals, not renderable messages.
        if (sdkMessage.type === 'system') {
          if (sdkMessage.subtype === 'task_started') {
            runningTaskIdsRef.current.add(sdkMessage.task_id as string)
            writeTaskCount()
            return
          }
          if (sdkMessage.subtype === 'task_notification') {
            runningTaskIdsRef.current.delete(sdkMessage.task_id as string)
            writeTaskCount()
            return
          }
          if (sdkMessage.subtype === 'task_progress') {
            return
          }
          // Track compaction state. The CLI emits status='compacting' at
          // the start and status=null when done; compact_boundary also
          // signals completion. Repeated 'compacting' status messages
          // (keep-alive ticks) update the ref but don't append to messages.
          if (sdkMessage.subtype === 'status') {
            const wasCompacting = isCompactingRef.current
            isCompactingRef.current = sdkMessage.status === 'compacting'
            if (wasCompacting && isCompactingRef.current) {
              return
            }
          }
          if (sdkMessage.subtype === 'compact_boundary') {
            isCompactingRef.current = false
          }
        }

        // Check if session ended
        if (isSessionEndMessage(sdkMessage)) {
          isCompactingRef.current = false
          remoteTurnActiveRef.current = false
          // A terminal worker event is independent proof that the main remote
          // turn ended, even if an earlier interrupt ACK timed out.
          remoteCancellationUnconfirmedRef.current = false
          // The remote worker can finish before the viewer-owned Haiku title.
          // Publish main idle immediately; title Stop routing is independent.
          if (
            canPublishRemoteSessionIdle({
              remoteTurnActive: remoteTurnActiveRef.current,
              titleRunActive: titleOwnershipRef.current.hasActiveOwner,
              managerDisconnectActive: retiredManagersRef.current.size > 0,
              cancellationPending: cancellationPendingRef.current,
              remoteCancellationUnconfirmed:
                remoteCancellationUnconfirmedRef.current,
              titleCancellationUnconfirmed:
                titleCancellationUnconfirmedRef.current,
            })
          ) {
            setIsLoading(false)
          }
        }

        // Clear in-progress tool_use IDs when their tool_result arrives.
        // Must read the RAW sdkMessage: in non-viewerOnly mode,
        // convertSDKMessage returns {type:'ignored'} for user messages, so the
        // delete would never fire post-conversion. Mirrors the add site below
        // and inProcessRunner.ts; without this the set grows unbounded for the
        // session lifetime (BQ: CCR cohort shows 5.2x higher RSS slope).
        if (setInProgressToolUseIDs && sdkMessage.type === 'user') {
          const content = (
            sdkMessage.message as { content?: unknown } | undefined
          )?.content
          if (Array.isArray(content)) {
            const resultIds: string[] = []
            for (const block of content) {
              if (block.type === 'tool_result') {
                resultIds.push(block.tool_use_id)
              }
            }
            if (resultIds.length > 0) {
              setInProgressToolUseIDs(prev => {
                const next = new Set(prev)
                for (const id of resultIds) next.delete(id)
                return next.size === prev.size ? prev : next
              })
            }
          }
        }

        // Convert SDK message to REPL message. In viewerOnly mode, the
        // remote agent runs BriefTool (SendUserMessage) — its tool_use block
        // renders empty (userFacingName() === ''), actual content is in the
        // tool_result. So we must convert tool_results to render them.
        const converted = convertSDKMessage(
          sdkMessage,
          config.viewerOnly
            ? { convertToolResults: true, convertUserTextMessages: true }
            : undefined,
        )

        if (converted.type === 'message') {
          // When we receive a complete message, clear streaming tool uses
          // since the complete message replaces the partial streaming state
          setStreamingToolUses?.(prev => (prev.length > 0 ? [] : prev))

          // Mark tool_use blocks as in-progress so the UI shows the correct
          // spinner state instead of "Waiting…" (queued). In local sessions,
          // toolOrchestration.ts handles this, but remote sessions receive
          // pre-built assistant messages without running local tool execution.
          if (
            setInProgressToolUseIDs &&
            converted.message.type === 'assistant'
          ) {
            const contentArr = Array.isArray(converted.message.message?.content)
              ? converted.message.message.content
              : []
            const toolUseIds = contentArr
              .filter(block => block.type === 'tool_use')
              .map(block => (block as { id: string }).id)
            if (toolUseIds.length > 0) {
              setInProgressToolUseIDs(prev => {
                const next = new Set(prev)
                for (const id of toolUseIds) {
                  next.add(id)
                }
                return next
              })
            }
          }

          setMessages(prev => [...prev, converted.message])
          // Note: Don't stop loading on assistant messages - the agent may still be
          // working (tool use loops). Loading stops only on session end or permission request.
        } else if (converted.type === 'stream_event') {
          // Process streaming events to update UI in real-time
          if (setStreamingToolUses && setStreamMode) {
            handleMessageFromStream(
              converted.event,
              message => setMessages(prev => [...prev, message]),
              () => {
                // No-op for response length - remote sessions don't track this
              },
              setStreamMode,
              setStreamingToolUses,
            )
          } else {
            logForDebugging(
              `[useRemoteSession] Stream event received but streaming callbacks not provided`,
            )
          }
        }
        // 'ignored' messages are silently dropped
      },
      onPermissionRequest: (request, requestId) => {
        if (!isCurrentManagerCallback()) return
        logForDebugging(
          `[useRemoteSession] Permission request for tool: ${request.tool_name}`,
        )

        // Look up the Tool object by name, or create a stub for unknown tools
        const tool =
          findToolByName(toolsRef.current, request.tool_name) ??
          createToolStub(request.tool_name)

        const syntheticMessage = createSyntheticAssistantMessage(
          request,
          requestId,
        )

        const permissionResult: PermissionAskDecision = {
          behavior: 'ask',
          message:
            request.description ??
            tf('{tool} requires permission', { tool: request.tool_name }),
          suggestions: request.permission_suggestions as PermissionUpdate[],
          blockedPath: request.blocked_path,
        }

        const removeRemotePermission = (): void => {
          remotePermissionIdsRef.current.delete(request.tool_use_id)
          setToolUseConfirmQueue(queue =>
            queue.filter(item => item.toolUseID !== request.tool_use_id),
          )
        }

        const toolUseConfirm: ToolUseConfirm = {
          assistantMessage: syntheticMessage,
          tool,
          description:
            request.description ??
            tf('{tool} requires permission', { tool: request.tool_name }),
          input: request.input,
          toolUseContext: {} as ToolUseConfirm['toolUseContext'],
          toolUseID: request.tool_use_id,
          permissionResult,
          permissionPromptStartTimeMs: Date.now(),
          onUserInteraction() {
            // No-op for remote — classifier runs on the container
          },
          onAbort() {
            if (!isCurrentManagerCallback()) return
            const response: RemotePermissionResponse = {
              behavior: 'deny',
              message: t('User aborted'),
            }
            manager.respondToPermissionRequest(requestId, response)
            removeRemotePermission()
          },
          onAllow(updatedInput, _permissionUpdates, _feedback) {
            if (!isCurrentManagerCallback()) return
            const response: RemotePermissionResponse = {
              behavior: 'allow',
              updatedInput,
            }
            manager.respondToPermissionRequest(requestId, response)
            removeRemotePermission()
            // Resume loading indicator after approving
            setIsLoading(true)
          },
          onReject(feedback?: string) {
            if (!isCurrentManagerCallback()) return
            const response: RemotePermissionResponse = {
              behavior: 'deny',
              message: feedback ?? t('User denied permission'),
            }
            manager.respondToPermissionRequest(requestId, response)
            removeRemotePermission()
          },
          async recheckPermission() {
            // No-op for remote — permission state is on the container
          },
        }

        remotePermissionIdsRef.current.add(request.tool_use_id)
        setToolUseConfirmQueue(queue => [...queue, toolUseConfirm])
        // Pause loading indicator while waiting for permission
        setIsLoading(false)
      },
      onPermissionCancelled: (requestId, toolUseId) => {
        if (!isCurrentManagerCallback()) return
        logForDebugging(
          `[useRemoteSession] Permission request cancelled: ${requestId}`,
        )
        const idToRemove = toolUseId ?? requestId
        remotePermissionIdsRef.current.delete(idToRemove)
        setToolUseConfirmQueue(queue =>
          queue.filter(item => item.toolUseID !== idToRemove),
        )
        setIsLoading(true)
      },
      onConnected: () => {
        if (!isCurrentManagerCallback()) return
        logForDebugging('[useRemoteSession] Connected')
        setConnStatus('connected')
      },
      onReconnecting: () => {
        if (!isCurrentManagerCallback()) return
        logForDebugging('[useRemoteSession] Reconnecting')
        setConnStatus('reconnecting')
        // WS gap = we may miss task_notification events. Clear rather than
        // drift high forever. Undercounts tasks that span the gap; accepted.
        runningTaskIdsRef.current.clear()
        writeTaskCount()
        // Same for tool_use IDs: missed tool_result during the gap would
        // leave stale spinner state forever.
        setInProgressToolUseIDs?.(prev => (prev.size > 0 ? new Set() : prev))
      },
      onDisconnected: () => {
        if (!isCurrentManagerCallback()) return
        logForDebugging('[useRemoteSession] Disconnected')
        setConnStatus('disconnected')
        if (
          canPublishRemoteSessionIdle({
            remoteTurnActive: remoteTurnActiveRef.current,
            titleRunActive: titleOwnershipRef.current.hasActiveOwner,
            managerDisconnectActive: retiredManagersRef.current.size > 0,
            cancellationPending: cancellationPendingRef.current,
            remoteCancellationUnconfirmed:
              remoteCancellationUnconfirmedRef.current,
            titleCancellationUnconfirmed:
              titleCancellationUnconfirmedRef.current,
          })
        ) {
          setIsLoading(false)
        }
        runningTaskIdsRef.current.clear()
        writeTaskCount()
        setInProgressToolUseIDs?.(prev => (prev.size > 0 ? new Set() : prev))
      },
      onError: error => {
        if (!isCurrentManagerCallback()) return
        logForDebugging(`[useRemoteSession] Error: ${error.message}`)
      },
    })

    // A replacement manager starts a fresh request lifecycle. A late result
    // from the previous manager must not keep this session's loading gate set.
    cancellationPendingRef.current = false
    cancellationGenerationRef.current += 1
    cancellationWarningShownRef.current = false
    managerRef.current = manager
    manager.connect()

    return () => {
      logForDebugging('[useRemoteSession] Cleanup - disconnecting')
      if (isCurrentManagerCallback()) {
        invalidateRemoteSessionCallbacks(managerCallbackGenerationRef)
      }
      cancellationGenerationRef.current += 1
      retireRemoteTitle('remote-session-disconnected')
      // Clear any pending timeout
      if (responseTimeoutRef.current) {
        clearTimeout(responseTimeoutRef.current)
        responseTimeoutRef.current = null
      }
      void retireRemoteManager(manager)
      if (managerRef.current === manager) managerRef.current = null
    }
  }, [
    config,
    setMessages,
    setIsLoading,
    onInit,
    setToolUseConfirmQueue,
    setStreamingToolUses,
    setStreamMode,
    setInProgressToolUseIDs,
    setConnStatus,
    writeTaskCount,
    reportUnconfirmedStop,
    clearRemotePermissions,
    resetRemoteLifecycle,
    retireRemoteTitle,
    retireRemoteManager,
  ])

  // Send a user message to the remote session
  const sendMessage = useCallback(
    async (
      content: RemoteMessageContent,
      opts?: { uuid?: string },
    ): Promise<boolean> => {
      const manager = managerRef.current
      if (!manager) {
        logForDebugging('[useRemoteSession] Cannot send - no manager')
        return false
      }
      if (retiredManagersRef.current.size > 0) {
        // A prior manager still owns a POST whose causal final interrupt was
        // not confirmed. Do not let the replacement session overlap it.
        setIsLoading(true)
        reportUnconfirmedStop()
        return false
      }
      if (remoteCancellationUnconfirmedRef.current) {
        // The main worker still lacks termination proof. Auxiliary title
        // failures are reported separately and never start another title run
        // because hasUpdatedTitleRef remains latched on unconfirmed cleanup.
        setIsLoading(true)
        reportUnconfirmedStop()
        return false
      }
      const requestGeneration = cancellationGenerationRef.current

      // Clear any existing timeout
      if (responseTimeoutRef.current) {
        clearTimeout(responseTimeoutRef.current)
      }

      remoteTurnActiveRef.current = true
      cancellationWarningShownRef.current = false
      setIsLoading(true)

      // Track locally-added message UUIDs so the WS echo can be filtered.
      // Must record BEFORE the POST to close the race where the echo arrives
      // before the POST promise resolves.
      if (opts?.uuid) sentUUIDsRef.current.add(opts.uuid)

      const success = await manager.sendMessage(content, opts)
      const requestLifecycleChanged =
        managerRef.current !== manager ||
        cancellationGenerationRef.current !== requestGeneration

      if (!success) {
        // No need to undo the pre-POST add — BoundedUUIDSet's ring evicts it.
        if (!requestLifecycleChanged) {
          remoteTurnActiveRef.current = false
          setIsLoading(false)
        }
        return false
      }
      if (requestLifecycleChanged) {
        // Stop/session replacement took ownership while the HTTP POST was in
        // flight. The causal interrupt handles the accepted user event; do not
        // start a fresh viewer-side title request after its cancellation
        // snapshot was already taken.
        return true
      }

      // Update the session title after the first message when no initial prompt was provided.
      // This gives the session a meaningful title on claude.ai instead of "Background task".
      // Skip in viewerOnly mode — the remote agent owns the session title.
      if (
        !hasUpdatedTitleRef.current &&
        config &&
        !config.hasInitialPrompt &&
        !config.viewerOnly &&
        retiredManagersRef.current.size === 0 &&
        !titleOwnershipRef.current.replacementBlocked
      ) {
        const sessionId = config.sessionId
        // Extract plain text from content (may be string or content block array)
        const description =
          typeof content === 'string'
            ? content
            : extractTextContent(content, ' ')
        if (description) {
          const titleAbortController = new AbortController()
          // Delay the provider call by one microtask so ownership is installed
          // before any inference can start.
          let launchTitle!: (owned: boolean) => void
          const launch = new Promise<boolean>(resolve => {
            launchTitle = resolve
          })
          const settled = launch.then(async (owned): Promise<void> => {
            if (!owned) return
            const title = await generateSessionTitle(
              description,
              titleAbortController.signal,
            )
            if (titleAbortController.signal.aborted) return
            await updateSessionTitle(
              sessionId,
              title ?? truncateToWidth(description, 75),
              titleAbortController.signal,
            )
          })
          const titleRun: RemoteTitleRun = {
            abortController: titleAbortController,
            settled,
          }
          const ownership = titleOwnershipRef.current
          if (ownership.tryStart(titleRun)) {
            hasUpdatedTitleRef.current = true
            titleCancellationUnconfirmedRef.current = false
            // The worker may emit session-end before this continuation
            // resolves. Keep Escape available for the title without pinning
            // the main session spinner/loading state.
            syncAuxiliaryStopAvailability()
            launchTitle(true)
            void settled
              .catch(error => {
                logForDebugging(
                  `[useRemoteSession] Session title request failed: ${error instanceof Error ? error.message : String(error)}`,
                )
                if (!ownership.owns(titleRun)) return
                if (error instanceof StopConfirmationError) {
                  ownership.complete(titleRun, true)
                  titleCancellationUnconfirmedRef.current = true
                  syncAuxiliaryStopAvailability()
                  reportUnconfirmedStop()
                }
              })
              .finally(() => {
                if (!ownership.owns(titleRun)) return
                ownership.complete(titleRun)
                syncAuxiliaryStopAvailability()
                titleCancellationUnconfirmedRef.current =
                  ownership.hasUnconfirmedStop
                if (
                  canPublishRemoteSessionIdle({
                    remoteTurnActive: remoteTurnActiveRef.current,
                    titleRunActive: ownership.hasActiveOwner,
                    managerDisconnectActive:
                      retiredManagersRef.current.size > 0,
                    cancellationPending: cancellationPendingRef.current,
                    remoteCancellationUnconfirmed:
                      remoteCancellationUnconfirmedRef.current,
                    titleCancellationUnconfirmed:
                      titleCancellationUnconfirmedRef.current,
                  })
                ) {
                  setIsLoading(false)
                }
              })
          } else {
            // A config replacement won the race before this microtask-backed
            // request started. Abort it without ever calling the provider.
            titleAbortController.abort('remote-title-ownership-lost')
            launchTitle(false)
          }
        }
      }

      // Start timeout to detect stuck sessions. Skip in viewerOnly mode —
      // the remote agent may be idle-shut and take >60s to respawn.
      // Use a longer timeout when the remote session is compacting, since
      // the CLI worker is busy with an API call and won't emit messages.
      if (!config?.viewerOnly && remoteTurnActiveRef.current) {
        const timeoutMs = isCompactingRef.current
          ? COMPACTION_TIMEOUT_MS
          : RESPONSE_TIMEOUT_MS
        responseTimeoutRef.current = setTimeout(
          (setMessages, manager) => {
            logForDebugging(
              '[useRemoteSession] Response timeout - attempting reconnect',
            )
            // Add a warning message to the conversation
            const warningMessage = createSystemMessage(
              t('Remote session may be unresponsive. Attempting to reconnect…'),
              'warning',
            )
            setMessages(prev => [...prev, warningMessage])

            // Attempt to reconnect the WebSocket - the subscription may have become stale
            manager.reconnect()
          },
          timeoutMs,
          setMessages,
          manager,
        )
      }

      return success
    },
    [
      config,
      setIsLoading,
      setMessages,
      reportUnconfirmedStop,
      syncAuxiliaryStopAvailability,
    ],
  )

  // Cancel the current request on the remote session
  const cancelRequest = useCallback(() => {
    // Clear any pending timeout
    if (responseTimeoutRef.current) {
      clearTimeout(responseTimeoutRef.current)
      responseTimeoutRef.current = null
    }

    // Send interrupt signal to CCR. Skip in viewerOnly mode — Ctrl+C
    // should never interrupt the remote agent.
    if (!config?.viewerOnly) {
      const titleOwnership = titleOwnershipRef.current
      const titleRun = titleOwnership.currentRun
      const hasMainCancellationWork =
        remoteTurnActiveRef.current ||
        cancellationPendingRef.current ||
        remoteCancellationUnconfirmedRef.current ||
        retiredManagersRef.current.size > 0

      if (!hasMainCancellationWork) {
        if (!titleRun) {
          setIsLoading(false)
          return
        }

        // The worker has already emitted its terminal event. Cancel only the
        // auxiliary title chain; sending another worker interrupt would turn
        // an idle session back into a misleading loading/cancellation state.
        const cancellation = titleOwnership.cancel('user-cancel')
        syncAuxiliaryStopAvailability()
        if (!cancellation) return
        if (observedTitleCancellationRef.current === cancellation) return
        observedTitleCancellationRef.current = cancellation
        void cancellation.then(confirmed => {
          if (observedTitleCancellationRef.current !== cancellation) return
          observedTitleCancellationRef.current = null
          titleCancellationUnconfirmedRef.current =
            titleOwnership.hasUnconfirmedStop
          syncAuxiliaryStopAvailability()
          if (confirmed) {
            hasUpdatedTitleRef.current = false
            cancellationWarningShownRef.current = false
          } else {
            reportUnconfirmedStop()
          }
          if (
            canPublishRemoteSessionIdle({
              remoteTurnActive: remoteTurnActiveRef.current,
              titleRunActive: titleOwnership.hasActiveOwner,
              managerDisconnectActive: retiredManagersRef.current.size > 0,
              cancellationPending: cancellationPendingRef.current,
              remoteCancellationUnconfirmed:
                remoteCancellationUnconfirmedRef.current,
              titleCancellationUnconfirmed:
                titleCancellationUnconfirmedRef.current,
            })
          ) {
            setIsLoading(false)
          }
        })
        return
      }

      // REPL resets its aggregate loading flags before invoking each concrete
      // canceller. Re-assert loading here and clear it only after the remote
      // worker acknowledges the interrupt; otherwise Escape merely makes the
      // local UI look idle while inference can still be running remotely.
      setIsLoading(true)
      cancellationPendingRef.current = true
      const cancellationGeneration = ++cancellationGenerationRef.current
      const manager = managerRef.current
      const titleWasAlreadyUnconfirmed = titleCancellationUnconfirmedRef.current
      const finishCancellation = (
        managerCancelled: boolean,
        titleCancelled: boolean,
        retiredManagersCancelled: boolean,
      ): void => {
        // A newly-created manager owns its own loading state. A manager that
        // was cleared during teardown does not: its late cancellation result
        // must still release the old loading gate and report uncertainty.
        if (
          cancellationGenerationRef.current !== cancellationGeneration ||
          (managerRef.current !== manager && managerRef.current !== null)
        )
          return
        cancellationPendingRef.current = false
        syncAuxiliaryStopAvailability()
        const outcome = resolveRemoteCancellationOutcome({
          managerCancelled,
          titleCancelled,
          remoteTurnActive: remoteTurnActiveRef.current,
        })
        const retiredManagerStopUnconfirmed =
          !retiredManagersCancelled || retiredManagersRef.current.size > 0
        titleCancellationUnconfirmedRef.current = outcome.titleStopUnconfirmed
        if (
          canRetryRemoteTitleAfterCancellation({
            hadTitleRun: titleRun !== null,
            titleCancelled,
          })
        ) {
          // A later turn may retry title generation only after the original
          // request chain proved that it ended. An unconfirmed request keeps
          // hasUpdatedTitleRef latched to prevent overlapping remote inference.
          hasUpdatedTitleRef.current = false
        }
        if (outcome.titleStopUnconfirmed || retiredManagerStopUnconfirmed) {
          reportUnconfirmedStop()
        }
        if (outcome.mainTurnStopped) {
          remoteTurnActiveRef.current = false
          remoteCancellationUnconfirmedRef.current = false
          if (!outcome.titleStopUnconfirmed && !retiredManagerStopUnconfirmed) {
            titleCancellationUnconfirmedRef.current = false
            cancellationWarningShownRef.current = false
          }
          setIsLoading(retiredManagerStopUnconfirmed)
          return
        }
        // A negative ACK is not an idle transition. Keep the cancellation
        // affordance live so Escape can retry instead of stranding a possibly
        // running request behind an already-idle UI.
        remoteCancellationUnconfirmedRef.current = true
        setIsLoading(true)
        reportUnconfirmedStop()
      }
      const managerCancellation = manager
        ? manager.cancelSession().catch(error => {
            logForDebugging(
              `[useRemoteSession] Remote cancellation failed: ${error instanceof Error ? error.message : String(error)}`,
            )
            return false
          })
        : Promise.resolve(false)
      const titleCancellation = titleRun
        ? (titleOwnership.cancel('user-cancel') ?? Promise.resolve(false))
        : Promise.resolve(!titleWasAlreadyUnconfirmed)
      syncAuxiliaryStopAvailability()
      const retiredManagerCancellation = Promise.all(
        [...retiredManagersRef.current].map(retireRemoteManager),
      ).then(results => results.every(Boolean))
      void Promise.all([
        managerCancellation,
        titleCancellation,
        retiredManagerCancellation,
      ]).then(
        ([managerCancelled, titleCancelled, retiredManagersCancelled]) => {
          finishCancellation(
            managerCancelled,
            titleCancelled,
            retiredManagersCancelled,
          )
        },
        error => {
          logForDebugging(
            `[useRemoteSession] Cancellation settlement failed: ${error instanceof Error ? error.message : String(error)}`,
          )
          finishCancellation(false, false, false)
        },
      )
    } else {
      cancellationPendingRef.current = false
      remoteTurnActiveRef.current = false
      setIsLoading(retiredManagersRef.current.size > 0)
    }
  }, [
    config,
    setIsLoading,
    reportUnconfirmedStop,
    retireRemoteManager,
    syncAuxiliaryStopAvailability,
  ])

  // Disconnect from the session
  const disconnect = useCallback(() => {
    const manager = managerRef.current
    managerRef.current = null
    if (manager) void retireRemoteManager(manager)
    retireRemoteTitle('remote-session-disconnected')
    resetRemoteLifecycle('remote-session-disconnected', {
      titleOwnerActive: titleOwnershipRef.current.hasActiveOwner,
      managerOwnerActive: retiredManagersRef.current.size > 0,
    })
  }, [resetRemoteLifecycle, retireRemoteTitle, retireRemoteManager])

  // All fields are stable (booleans plus three useCallbacks). The
  // result object is consumed by REPL's onSubmit useCallback deps — without
  // memoization the fresh literal invalidates onSubmit on every REPL render,
  // which in turn churns PromptInput's props and downstream memoization.
  return useMemo(
    () => ({
      isRemoteMode,
      hasCancelableAuxiliaryWork,
      sendMessage,
      cancelRequest,
      disconnect,
    }),
    [
      isRemoteMode,
      hasCancelableAuxiliaryWork,
      sendMessage,
      cancelRequest,
      disconnect,
    ],
  )
}
