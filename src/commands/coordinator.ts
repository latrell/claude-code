/**
 * /coordinator — Toggle coordinator (multi-worker orchestration) mode.
 *
 * When enabled, the CLI becomes an orchestrator that dispatches tasks
 * to worker agents via Agent({ subagent_type: "worker" }).
 * The coordinator can only use Agent, SendMessage, and TaskStop.
 *
 * Usage: /coordinator [on|off] [global]
 *   - No args: toggle for the current session
 *   - on/off: set explicitly for the current session
 *   - global: also persist the resulting state to settings.json as the
 *     default for new sessions (an explicit CLAUDE_CODE_COORDINATOR_MODE
 *     env var still takes precedence at startup)
 */
import { feature } from 'bun:bundle'
import type { ToolUseContext } from '../Tool.js'
import type {
  Command,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../types/command.js'
import { t } from '../i18n/t.js'

type ParsedArgs = { target: 'on' | 'off' | undefined; global: boolean } | null

function parseCoordinatorArgs(args: string): ParsedArgs {
  let target: 'on' | 'off' | undefined
  let global = false
  for (const token of args.trim().toLowerCase().split(/\s+/)) {
    if (token === '') {
      continue
    }
    if ((token === 'on' || token === 'off') && target === undefined) {
      target = token
    } else if (token === 'global' && !global) {
      global = true
    } else {
      return null
    }
  }
  return { target, global }
}

const coordinator = {
  type: 'local-jsx',
  name: 'coordinator',
  get description() {
    return t('Toggle coordinator (multi-worker) mode')
  },
  argumentHint: '[on|off] [global]',
  isEnabled: () => {
    if (feature('COORDINATOR_MODE')) {
      return true
    }
    return false
  },
  immediate: true,
  load: () =>
    Promise.resolve({
      async call(
        onDone: LocalJSXCommandOnDone,
        context: ToolUseContext & LocalJSXCommandContext,
        args: string,
      ): Promise<React.ReactNode> {
        const mod =
          require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js')
        const globalMod =
          require('../coordinator/coordinatorGlobal.js') as typeof import('../coordinator/coordinatorGlobal.js')
        const { getOriginalCwd } =
          require('../bootstrap/state.js') as typeof import('../bootstrap/state.js')
        const { saveMode } =
          require('../utils/sessionStorage.js') as typeof import('../utils/sessionStorage.js')
        const {
          clearAgentDefinitionsCache,
          getActiveAgentsFromList,
          getAgentDefinitionsWithOverrides,
        } =
          require('@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js') as typeof import('@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js')

        const parsed = parseCoordinatorArgs(args ?? '')
        if (parsed === null) {
          onDone(t('Usage: /coordinator [on|off] [global]'), {
            display: 'system',
          })
          return null
        }

        const refreshAgentDefinitions = async () => {
          clearAgentDefinitionsCache()
          const freshAgentDefs = await getAgentDefinitionsWithOverrides(
            getOriginalCwd(),
          )
          context.setAppState(prev => ({
            ...prev,
            agentDefinitions: {
              ...freshAgentDefs,
              allAgents: freshAgentDefs.allAgents,
              activeAgents: getActiveAgentsFromList(freshAgentDefs.allAgents),
            },
          }))
        }

        const current = mod.isCoordinatorMode()
        const next = parsed.target ? parsed.target === 'on' : !current

        if (parsed.global) {
          globalMod.setGlobalCoordinatorSetting(next)
        }

        const globalSuffix = parsed.global
          ? next
            ? t(' (saved as global default)')
            : t(' (global default cleared)')
          : ''

        if (next === current) {
          // Explicit on/off with no state change — skip the env flip, agent
          // refresh, and model-visible reminder; just report (and persist
          // the global default when requested).
          onDone(
            (next
              ? t('Coordinator mode is already enabled')
              : t('Coordinator mode is already disabled')) + globalSuffix,
            { display: 'system' },
          )
          return null
        }

        if (!next) {
          // Disable: clear the env var
          delete process.env.CLAUDE_CODE_COORDINATOR_MODE
          saveMode('normal')
          await refreshAgentDefinitions()
          onDone(
            t('Coordinator mode disabled — back to normal mode') + globalSuffix,
            {
              display: 'system',
              metaMessages: [
                '<system-reminder>\nCoordinator mode is now disabled. You have access to all standard tools again. Work directly instead of dispatching to workers.\n</system-reminder>',
              ],
            },
          )
        } else {
          // Enable: set the env var
          process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'
          saveMode('coordinator')
          await refreshAgentDefinitions()
          onDone(
            t(
              'Coordinator mode enabled — use Agent(subagent_type: "worker") to dispatch tasks',
            ) + globalSuffix,
            {
              display: 'system',
              metaMessages: [
                '<system-reminder>\nCoordinator mode is now enabled. You are an orchestrator. Use Agent({ subagent_type: "worker" }) to spawn async workers, SendMessage to continue them, TaskStop to stop them. After launching workers, end your response and wait for <task-notification>; do not use Sleep, shell sleep/Start-Sleep, TaskOutput, or polling to wait. Do not use other tools directly.\n</system-reminder>',
              ],
            },
          )
        }
        return null
      },
    }),
} satisfies Command

export default coordinator
