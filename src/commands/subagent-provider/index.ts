import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { getEffectiveSubagentProvider } from '../../utils/model/subagentProvider.js'
import {
  updateSettingsForSource,
  getSettings_DEPRECATED,
} from '../../utils/settings/settings.js'
import { t, tf } from '../../i18n/t.js'

const call: LocalCommandCall = async (args, _context) => {
  const arg = args.trim().toLowerCase()

  // No argument: show current subagent provider status
  if (!arg) {
    const current = getEffectiveSubagentProvider()
    const settings = getSettings_DEPRECATED()
    const hasSettingsOverride = !!settings?.subagentProvider?.modelType
    const source = hasSettingsOverride
      ? tf(' (from settings: {provider})', {
          provider: settings!.subagentProvider!.modelType,
        })
      : ''
    return {
      type: 'text',
      value: tf('Current subagent provider: {provider}{source}', {
        provider: current,
        source,
      }),
    }
  }

  // unset - clear subagentProvider from settings, subagents inherit main provider
  if (arg === 'unset') {
    updateSettingsForSource('userSettings', {
      subagentProvider: undefined,
    })
    return {
      type: 'text',
      value: t(
        'Subagent provider cleared. Subagents will now inherit the main provider.',
      ),
    }
  }

  // Validate provider
  const validProviders = ['anthropic', 'openai', 'gemini', 'grok']
  if (!validProviders.includes(arg)) {
    if (['bedrock', 'vertex', 'foundry'].includes(arg)) {
      return {
        type: 'text',
        value: tf(
          'Subagent provider "{provider}" is not supported. Subagents only support: {validProviders}',
          {
            provider: arg,
            validProviders: validProviders.join(', '),
          },
        ),
      }
    }
    return {
      type: 'text',
      value: tf('Invalid provider: {provider}\nValid: {validProviders}', {
        provider: arg,
        validProviders: validProviders.join(', '),
      }),
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
      ...(existingSubagent?.model !== undefined && {
        model: existingSubagent.model,
      }),
      credentialScope: existingSubagent?.credentialScope ?? 'subagent',
    },
  })

  return {
    type: 'text',
    value: tf('Subagent provider set to {provider}.', { provider: arg }),
  }
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
