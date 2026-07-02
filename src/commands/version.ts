import type { Command, LocalCommandCall } from '../types/command.js'
import { t } from '../i18n/t.js'

const call: LocalCommandCall = async () => {
  return {
    type: 'text',
    value: MACRO.BUILD_TIME
      ? `${MACRO.VERSION_DISPLAY} (built ${MACRO.BUILD_TIME})`
      : MACRO.VERSION_DISPLAY,
  }
}

const version = {
  type: 'local',
  name: 'version',
  get description() {
    return t(
      'Print the version this session is running (not what autoupdate downloaded)',
    )
  },
  // Was Ant-only upstream; for fork subscribers we want this universally
  // available — version info is harmless and useful for bug reports.
  isEnabled: () => true,
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default version
