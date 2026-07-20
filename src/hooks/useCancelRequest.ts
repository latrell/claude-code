/**
 * CancelRequestHandler component for handling cancel/escape keybinding.
 *
 * Must be rendered inside KeybindingSetup to have access to the keybinding context.
 * This component renders nothing - it just registers the cancel keybinding handler.
 */
import { useCallback, useRef } from 'react'
import { logEvent } from 'src/services/analytics/index.js'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from 'src/services/analytics/metadata.js'
import {
  useAppState,
  useAppStateStore,
  useSetAppState,
} from 'src/state/AppState.js'
import { isVimModeEnabled } from '../components/PromptInput/utils.js'
import type { ToolUseConfirm } from '../components/permissions/PermissionRequest.js'
import type { SpinnerMode } from '../components/Spinner/types.js'
import { useNotifications } from '../context/notifications.js'
import { useIsOverlayActive } from '../context/overlayContext.js'
import { t, tf } from '../i18n/t.js'
import { localizedStopErrorMessage } from '../i18n/stop.js'
import { useCommandQueue } from '../hooks/useCommandQueue.js'
import { getShortcutDisplay } from '../keybindings/shortcutFormat.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import type { Screen } from '../screens/REPL.js'
import { exitTeammateView } from '../state/teammateViewHelpers.js'
import {
  killAllRunningAgentTasks,
  markAgentsNotified,
  suppressAgentNotification,
} from '../tasks/LocalAgentTask/LocalAgentTask.js'
import type { PromptInputMode, VimMode } from '../types/textInputTypes.js'
import {
  clearCommandQueue,
  enqueuePendingNotification,
  isQueuedCommandEditable,
} from '../utils/messageQueueManager.js'
import { emitTaskTerminatedSdk } from '../utils/sdkEventQueue.js'
import { canCancelRequest } from '../utils/cancelRequest.js'
import {
  reconcileAgentStopResults,
  shouldEmitAggregateStoppedSdk,
} from './agentStopResults.js'

/** Time window in ms during which a second press kills all background agents. */
const KILL_AGENTS_CONFIRM_WINDOW_MS = 3000

type CancelRequestHandlerProps = {
  setToolUseConfirmQueue: (
    f: (toolUseConfirmQueue: ToolUseConfirm[]) => ToolUseConfirm[],
  ) => void
  onCancel: () => void
  onAgentsKilled: () => void
  isMessageSelectorVisible: boolean
  screen: Screen
  abortSignal?: AbortSignal
  isQueryActive?: boolean
  isExternalLoading?: boolean
  hasCancelableAuxiliaryWork?: boolean
  popCommandFromQueue?: () => void
  vimMode?: VimMode
  isLocalJSXCommand?: boolean
  isSearchingHistory?: boolean
  isHelpOpen?: boolean
  inputMode?: PromptInputMode
  inputValue?: string
  streamMode?: SpinnerMode
}

/**
 * Component that handles cancel requests via keybinding.
 * Renders null but registers the 'chat:cancel' keybinding handler.
 */
export function CancelRequestHandler(props: CancelRequestHandlerProps): null {
  const {
    setToolUseConfirmQueue,
    onCancel,
    onAgentsKilled,
    isMessageSelectorVisible,
    screen,
    abortSignal,
    isQueryActive = false,
    isExternalLoading = false,
    hasCancelableAuxiliaryWork = false,
    popCommandFromQueue,
    vimMode,
    isLocalJSXCommand,
    isSearchingHistory,
    isHelpOpen,
    inputMode,
    inputValue,
    streamMode,
  } = props
  const store = useAppStateStore()
  const setAppState = useSetAppState()
  const queuedCommands = useCommandQueue()
  const hasQueuedCommands = queuedCommands.some(
    command =>
      command.agentId === undefined && isQueuedCommandEditable(command),
  )
  const { addNotification, removeNotification } = useNotifications()
  const lastKillAgentsPressRef = useRef<number>(0)
  const viewSelectionMode = useAppState(s => s.viewSelectionMode)

  const handleCancel = useCallback(() => {
    const cancelProps = {
      source:
        'escape' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      streamMode:
        streamMode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    }

    // Priority 1: If there's an active task running, cancel it first
    // This takes precedence over queue management so users can always interrupt Claude
    if (
      canCancelRequest(abortSignal, isExternalLoading, isQueryActive) ||
      hasCancelableAuxiliaryWork
    ) {
      logEvent('tengu_cancel', cancelProps)
      setToolUseConfirmQueue(() => [])
      onCancel()
      return
    }

    // Priority 2: Pop queue when Claude is idle (no running task to cancel)
    if (hasQueuedCommands) {
      if (popCommandFromQueue) {
        popCommandFromQueue()
        return
      }
    }

    // Fallback: nothing to cancel or pop (shouldn't reach here if isActive is correct)
    logEvent('tengu_cancel', cancelProps)
    setToolUseConfirmQueue(() => [])
    onCancel()
  }, [
    abortSignal,
    isQueryActive,
    isExternalLoading,
    hasCancelableAuxiliaryWork,
    hasQueuedCommands,
    popCommandFromQueue,
    setToolUseConfirmQueue,
    onCancel,
    streamMode,
  ])

  // Determine if this handler should be active
  // Other contexts (Transcript, HistorySearch, Help) have their own escape handlers
  // Overlays (ModelPicker, ThinkingToggle, etc.) register themselves via useRegisterOverlay
  // Local JSX commands (like /model, /btw) handle their own input
  const isOverlayActive = useIsOverlayActive()
  const canCancelRunningTask = canCancelRequest(
    abortSignal,
    isExternalLoading,
    isQueryActive,
  )
  const canCancelForegroundOrAuxiliary =
    canCancelRunningTask || hasCancelableAuxiliaryWork
  // When in bash/background mode with empty input, escape should exit the mode
  // rather than cancel the request. Let PromptInput handle mode exit.
  // This only applies to Escape, not Ctrl+C which should always cancel.
  const isInSpecialModeWithEmptyInput =
    inputMode !== undefined && inputMode !== 'prompt' && !inputValue
  // When viewing a teammate's transcript, let useBackgroundTaskNavigation handle Escape
  const isViewingTeammate = viewSelectionMode === 'viewing-agent'
  // Context guards: other screens/overlays handle their own cancel
  const isContextActive =
    screen !== 'transcript' &&
    !isSearchingHistory &&
    !isMessageSelectorVisible &&
    !isLocalJSXCommand &&
    !isHelpOpen &&
    !isOverlayActive &&
    !(isVimModeEnabled() && vimMode === 'INSERT')

  // Escape (chat:cancel) defers to mode-exit when in special mode with empty
  // input, and to useBackgroundTaskNavigation when viewing a teammate
  const isEscapeActive =
    isContextActive &&
    (canCancelForegroundOrAuxiliary || hasQueuedCommands) &&
    !isInSpecialModeWithEmptyInput &&
    !isViewingTeammate

  // Ctrl+C (app:interrupt): when viewing a teammate, stops everything and
  // returns to main thread. Otherwise just handleCancel. Must NOT claim
  // ctrl+c when main is idle at the prompt — that blocks the copy-selection
  // handler and double-press-to-exit from ever seeing the keypress.
  const isCtrlCActive =
    isContextActive &&
    (canCancelForegroundOrAuxiliary || hasQueuedCommands || isViewingTeammate)

  useKeybinding('chat:cancel', handleCancel, {
    context: 'Chat',
    isActive: isEscapeActive,
  })

  // Shared kill path: stop all agents, then publish stopped notifications
  // only after every runner has actually settled.
  // Returns true if a stop attempt was started. The confirmed stopped set is
  // computed asynchronously from both kill outcomes and fresh task state.
  const killAllAgentsAndNotify = useCallback((): boolean => {
    const tasks = store.getState().tasks
    const running = Object.entries(tasks).filter(
      ([, t]) => t.type === 'local_agent' && t.status === 'running',
    )
    if (running.length === 0) return false
    const releaseSuppressions = running.map(([taskId]) =>
      suppressAgentNotification(taskId),
    )
    void killAllRunningAgentTasks(tasks, setAppState)
      .then(result => {
        const currentTasks = store.getState().tasks
        const { stoppedIds, failures } = reconcileAgentStopResults(
          result.succeeded,
          result.alreadyTerminal,
          result.failures,
          currentTasks,
        )
        const succeededIds = new Set(stoppedIds)
        const stopped = running.filter(([taskId]) => succeededIds.has(taskId))
        for (const [taskId, task] of stopped) {
          markAgentsNotified(taskId, setAppState)
          const stoppedTask = currentTasks[taskId]
          // Foreground agents publish their own terminal SDK event from the
          // outer lifecycle finally. Background killed notifications are
          // suppressed during aggregate Stop, so only those need a replacement.
          if (shouldEmitAggregateStoppedSdk(stoppedTask)) {
            emitTaskTerminatedSdk(task.id, 'stopped', {
              toolUseId: task.toolUseId,
              summary: task.description,
            })
          }
        }
        if (stopped.length > 0) {
          const descriptions = stopped.map(([, task]) => task.description)
          const summary =
            descriptions.length === 1
              ? tf(
                  'Background agent "{description}" was stopped by the user.',
                  { description: descriptions[0] },
                )
              : tf(
                  '{n} background agents were stopped by the user: {descriptions}',
                  {
                    n: descriptions.length,
                    descriptions: descriptions.map(d => `"${d}"`).join(', '),
                  },
                )
          enqueuePendingNotification({
            value: summary,
            mode: 'task-notification',
          })
          onAgentsKilled()
        }

        if (failures.length > 0) {
          const failureText = failures
            .map(
              ({ taskId, error }) =>
                `${taskId}: ${localizedStopErrorMessage(error)}`,
            )
            .join('; ')
          addNotification({
            key: 'kill-agents-failed',
            text: tf('Could not confirm all agents stopped: {error}', {
              error: failureText,
            }),
            priority: 'immediate',
            timeoutMs: 5000,
          })
          enqueuePendingNotification({
            value: tf('Agent Stop was not confirmed for: {error}', {
              error: failureText,
            }),
            mode: 'task-notification',
          })
        }
      })
      .catch(error => {
        // Keep unconfirmed tasks visible/notified=false so the user can retry.
        addNotification({
          key: 'kill-agents-failed',
          text: tf('Could not confirm all agents stopped: {error}', {
            error: localizedStopErrorMessage(error),
          }),
          priority: 'immediate',
          timeoutMs: 5000,
        })
      })
      .finally(() => {
        releaseSuppressions.forEach(release => release())
      })
    return true
  }, [store, setAppState, onAgentsKilled, addNotification])

  // Ctrl+C (app:interrupt). Scoped to teammate-view: killing agents from the
  // main prompt stays a deliberate gesture (chat:killAgents), not a
  // side-effect of cancelling a turn.
  const handleInterrupt = useCallback(() => {
    if (isViewingTeammate) {
      killAllAgentsAndNotify()
      exitTeammateView(setAppState)
    }
    if (canCancelForegroundOrAuxiliary || hasQueuedCommands) {
      handleCancel()
    }
  }, [
    isViewingTeammate,
    killAllAgentsAndNotify,
    setAppState,
    canCancelForegroundOrAuxiliary,
    hasQueuedCommands,
    handleCancel,
  ])

  useKeybinding('app:interrupt', handleInterrupt, {
    context: 'Global',
    isActive: isCtrlCActive,
  })

  // chat:killAgents uses a two-press pattern: first press shows a
  // confirmation hint, second press within the window actually kills all
  // agents. Reads tasks from the store directly to avoid stale closures.
  const handleKillAgents = useCallback(() => {
    const tasks = store.getState().tasks
    const hasRunningAgents = Object.values(tasks).some(
      t => t.type === 'local_agent' && t.status === 'running',
    )
    if (!hasRunningAgents) {
      addNotification({
        key: 'kill-agents-none',
        text: t('No background agents running'),
        priority: 'immediate',
        timeoutMs: 2000,
      })
      return
    }
    const now = Date.now()
    const elapsed = now - lastKillAgentsPressRef.current
    if (elapsed <= KILL_AGENTS_CONFIRM_WINDOW_MS) {
      // Second press within window -- kill all background agents
      lastKillAgentsPressRef.current = 0
      removeNotification('kill-agents-confirm')
      logEvent('tengu_cancel', {
        source:
          'kill_agents' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      clearCommandQueue()
      killAllAgentsAndNotify()
      return
    }
    // First press -- show confirmation hint in status bar
    lastKillAgentsPressRef.current = now
    const shortcut = getShortcutDisplay(
      'chat:killAgents',
      'Chat',
      'ctrl+x ctrl+k',
    )
    addNotification({
      key: 'kill-agents-confirm',
      text: tf('Press {shortcut} again to stop background agents', {
        shortcut,
      }),
      priority: 'immediate',
      timeoutMs: KILL_AGENTS_CONFIRM_WINDOW_MS,
    })
  }, [store, addNotification, removeNotification, killAllAgentsAndNotify])

  // Must stay always-active: ctrl+x is consumed as a chord prefix regardless
  // of isActive (because ctrl+x ctrl+e is always live), so an inactive handler
  // here would leak ctrl+k to readline kill-line. Handler gates internally.
  useKeybinding('chat:killAgents', handleKillAgents, {
    context: 'Chat',
  })

  return null
}
