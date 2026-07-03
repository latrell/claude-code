import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { getEffectiveSubagentProvider } from '../../utils/model/subagentProvider.js'
import {
  updateSettingsForSource,
  getSettings_DEPRECATED,
} from '../../utils/settings/settings.js'

const call: LocalCommandCall = async (args, _context) => {
  const arg = args.trim().toLowerCase()

  // No argument: show current subagent provider status
  if (!arg) {
    const current = getEffectiveSubagentProvider()
    const settings = getSettings_DEPRECATED()
    const hasSettingsOverride = !!settings?.subagentProvider?.modelType
    const source = hasSettingsOverride
      ? ` (from settings: ${settings!.subagentProvider!.modelType})`
      : ''
    return {
      type: 'text',
      value: `Current subagent provider: ${current}${source}`,
    }
  }

  // unset - clear subagentProvider from settings, subagents inherit main provider
  if (arg === 'unset') {
    updateSettingsForSource('userSettings', {
      subagentProvider: undefined,
    })
    return {
      type: 'text',
      value:
        'Subagent provider cleared. Subagents will now inherit the main provider.',
    }
  }

  // Validate provider
  const validProviders = ['anthropic', 'openai', 'gemini', 'grok']
  if (!validProviders.includes(arg)) {
    if (['bedrock', 'vertex', 'foundry'].includes(arg)) {
      return {
        type: 'text',
        value: `Subagent provider "${arg}" is not supported. Subagents only support: ${validProviders.join(', ')}`,
      }
    }
    return {
      type: 'text',
      value: `Invalid provider: ${arg}\nValid: ${validProviders.join(', ')}`,
    }
  }

  // Get existing subagentProvider settings to preserve env and credentialScope
  const existingSettings = getSettings_DEPRECATED()
  const existingSubagent = existingSettings?.subagentProvider

  // Write to settings.json
  updateSettingsForSource('userSettings', {
    subagentProvider: {
      modelType: arg as 'anthropic' | 'openai' | 'gemini' | 'grok',
      ...(existingSubagent?.env && { env: existingSubagent.env }),
      credentialScope: existingSubagent?.credentialScope ?? 'subagent',
    },
  })

  return { type: 'text', value: `Subagent provider set to ${arg}.` }
}

const subagentProvider = {
  type: 'local',
  name: 'subagent-provider',
  description:
    'Switch or check the subagent API provider (anthropic/openai/gemini/grok/unset)',
  aliases: ['subapi'],
  argumentHint: '[anthropic|openai|gemini|grok|unset]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default subagentProvider
