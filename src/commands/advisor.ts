import type { Command } from '../commands.js'
import type { LocalCommandCall } from '../types/command.js'
import {
  canUserConfigureAdvisor,
  isValidAdvisorModel,
  modelSupportsAdvisor,
} from '../utils/advisor.js'
import {
  getDefaultMainLoopModelSetting,
  normalizeModelStringForAPI,
  parseUserSpecifiedModel,
} from '../utils/model/model.js'
import { validateModel } from '../utils/model/validateModel.js'
import { updateSettingsForSource } from '../utils/settings/settings.js'
import { t, tf } from '../i18n/t.js'

const call: LocalCommandCall = async (args, context) => {
  const arg = args.trim().toLowerCase()
  const baseModel = parseUserSpecifiedModel(
    context.getAppState().mainLoopModel ?? getDefaultMainLoopModelSetting(),
  )

  if (!arg) {
    const current = context.getAppState().advisorModel
    if (!current) {
      return {
        type: 'text',
        value: t(
          'Advisor: not set\nUse "/advisor <model>" to enable (e.g. "/advisor opus").',
        ),
      }
    }
    if (!modelSupportsAdvisor(baseModel)) {
      return {
        type: 'text',
        value: tf(
          'Advisor: {model} (inactive)\nThe current model ({base}) does not support advisors.',
          {
            model: current,
            base: baseModel,
          },
        ),
      }
    }
    return {
      type: 'text',
      value: tf(
        'Advisor: {model}\nUse "/advisor unset" to disable or "/advisor <model>" to change.',
        { model: current },
      ),
    }
  }

  if (arg === 'unset' || arg === 'off') {
    const prev = context.getAppState().advisorModel
    context.setAppState(s => {
      if (s.advisorModel === undefined) return s
      return { ...s, advisorModel: undefined }
    })
    updateSettingsForSource('userSettings', { advisorModel: undefined })
    return {
      type: 'text',
      value: prev
        ? tf('Advisor disabled (was {model}).', { model: prev })
        : t('Advisor already unset.'),
    }
  }

  const normalizedModel = normalizeModelStringForAPI(arg)
  const resolvedModel = parseUserSpecifiedModel(arg)
  const { valid, error } = await validateModel(resolvedModel)
  if (!valid) {
    return {
      type: 'text',
      value: error
        ? tf('Invalid advisor model: {error}', { error })
        : tf('Unknown model: {arg} ({resolved})', {
            arg,
            resolved: resolvedModel,
          }),
    }
  }

  if (!isValidAdvisorModel(resolvedModel)) {
    return {
      type: 'text',
      value: tf('The model {arg} ({resolved}) cannot be used as an advisor', {
        arg,
        resolved: resolvedModel,
      }),
    }
  }

  context.setAppState(s => {
    if (s.advisorModel === normalizedModel) return s
    return { ...s, advisorModel: normalizedModel }
  })
  updateSettingsForSource('userSettings', { advisorModel: normalizedModel })

  if (!modelSupportsAdvisor(baseModel)) {
    return {
      type: 'text',
      value: tf(
        'Advisor set to {model}.\nNote: Your current model ({base}) does not support advisors. Switch to a supported model to use the advisor.',
        { model: normalizedModel, base: baseModel },
      ),
    }
  }

  return {
    type: 'text',
    value: tf('Advisor set to {model}.', { model: normalizedModel }),
  }
}

const advisor = {
  type: 'local',
  name: 'advisor',
  get description() {
    return t('Configure the advisor model')
  },
  argumentHint: '[<model>|off]',
  isEnabled: () => canUserConfigureAdvisor(),
  get isHidden() {
    return !canUserConfigureAdvisor()
  },
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default advisor
