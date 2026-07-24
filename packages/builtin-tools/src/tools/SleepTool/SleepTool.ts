import { feature } from 'bun:bundle'
import { z } from 'zod/v4'
import type { ToolResultBlockParam, ToolUseContext } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { t, tf } from 'src/i18n/t.js'
import { formatDuration } from 'src/utils/format.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { notifyAutomationStateChanged } from 'src/utils/sessionState.js'
import { SLEEP_TOOL_NAME, DESCRIPTION, SLEEP_TOOL_PROMPT } from './prompt.js'

const SLEEP_WAKE_CHECK_INTERVAL_MS = 500

const inputSchema = lazySchema(() =>
  z.strictObject({
    duration_seconds: z
      .number()
      .describe(
        'How long to sleep in seconds. Can be interrupted by the user at any time.',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>
type SleepInput = z.infer<InputSchema>

type SleepOutput = { slept_seconds: number; interrupted: boolean }

function isProactiveAutomationEnabled(): boolean {
  if (!(feature('PROACTIVE') || feature('KAIROS'))) {
    return false
  }

  const mod =
    require('src/proactive/index.js') as typeof import('src/proactive/index.js')
  return mod.isProactiveActive()
}

function isProactiveSleepAllowed(): boolean {
  if (!(feature('PROACTIVE') || feature('KAIROS'))) {
    return true
  }

  const mod =
    require('src/proactive/index.js') as typeof import('src/proactive/index.js')
  return mod.isProactiveActive()
}

function hasQueuedWakeSignal(agentId: ToolUseContext['agentId']): boolean {
  const queue =
    require('src/utils/messageQueueManager.js') as typeof import('src/utils/messageQueueManager.js')
  return queue.hasCommandsAddressedTo(agentId)
}

function shouldInterruptSleep(agentId: ToolUseContext['agentId']): boolean {
  return !isProactiveSleepAllowed() || hasQueuedWakeSignal(agentId)
}

export const SleepTool = buildTool({
  name: SLEEP_TOOL_NAME,
  searchHint: 'wait pause sleep rest idle duration timer',
  maxResultSizeChars: 1_000,
  strict: true,

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return SLEEP_TOOL_PROMPT
  },

  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  interruptBehavior() {
    return 'cancel'
  },

  userFacingName() {
    return SLEEP_TOOL_NAME
  },

  renderToolUseMessage(input: Partial<SleepInput>) {
    return input.duration_seconds === undefined
      ? t('Sleep')
      : tf('Sleep: {duration}', {
          duration: formatDuration(input.duration_seconds * 1000, {
            hideTrailingZeros: true,
          }),
        })
  },

  renderToolResultMessage(content: SleepOutput) {
    const duration = formatDuration(content.slept_seconds * 1000, {
      hideTrailingZeros: true,
    })
    return content.interrupted
      ? tf('Sleep interrupted after {duration}', { duration })
      : tf('Slept for {duration}', { duration })
  },

  mapToolResultToToolResultBlockParam(
    content: SleepOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    const duration = formatDuration(content.slept_seconds * 1000, {
      hideTrailingZeros: true,
      language: 'en',
    })
    const msg = content.interrupted
      ? `Sleep interrupted after ${duration}`
      : `Slept for ${duration}`
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },

  async call(input: SleepInput, context) {
    // Don't enter sleep if proactive was disabled or new work arrived while
    // the model was deciding to wait.
    if (shouldInterruptSleep(context.agentId)) {
      return {
        data: {
          slept_seconds: 0,
          interrupted: true,
        },
      }
    }

    const { duration_seconds } = input
    const startTime = Date.now()
    const sleepUntil = startTime + duration_seconds * 1000

    if (isProactiveAutomationEnabled()) {
      notifyAutomationStateChanged({
        enabled: true,
        phase: 'sleeping',
        next_tick_at: null,
        sleep_until: sleepUntil,
      })
    }

    try {
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | null = null
        let wakeCheck: ReturnType<typeof setInterval> | null = null
        let settled = false

        const cleanup = () => {
          if (timer !== null) {
            clearTimeout(timer)
            timer = null
          }
          if (wakeCheck !== null) {
            clearInterval(wakeCheck)
            wakeCheck = null
          }
          context.abortController.signal.removeEventListener('abort', onAbort)
        }

        const finish = () => {
          if (settled) return
          settled = true
          cleanup()
          resolve()
        }

        const interrupt = () => {
          if (settled) return
          settled = true
          cleanup()
          reject(new Error('interrupted'))
        }

        const onAbort = () => {
          interrupt()
        }

        timer = setTimeout(finish, duration_seconds * 1000)

        // Abort via user interrupt
        if (context.abortController.signal.aborted) {
          interrupt()
          return
        }
        context.abortController.signal.addEventListener('abort', onAbort, {
          once: true,
        })

        // Poll proactive state and the shared command queue so new work can
        // wake Sleep without waiting for the full duration.
        wakeCheck = setInterval(() => {
          if (shouldInterruptSleep(context.agentId)) {
            interrupt()
          }
        }, SLEEP_WAKE_CHECK_INTERVAL_MS)
      })
      return {
        data: {
          slept_seconds: duration_seconds,
          interrupted: false,
        },
      }
    } catch {
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      return {
        data: {
          slept_seconds: elapsed,
          interrupted: true,
        },
      }
    } finally {
      notifyAutomationStateChanged(
        isProactiveAutomationEnabled()
          ? {
              enabled: true,
              phase: null,
              next_tick_at: null,
              sleep_until: null,
            }
          : null,
      )
    }
  },
})
