import { Text } from '@anthropic/ink';
import { T } from '../i18n/TText.js';
import { isClaudeAISubscriber } from '../utils/auth.js';
import { isChromeExtensionInstalled, shouldEnableClaudeInChrome } from '../utils/claudeInChrome/setup.js';
import { isRunningOnHomespace } from '../utils/envUtils.js';
import { useStartupNotification } from './notifs/useStartupNotification.js';

function getChromeFlag(): boolean | undefined {
  if (process.argv.includes('--chrome')) {
    return true;
  }
  if (process.argv.includes('--no-chrome')) {
    return false;
  }
  return undefined;
}

export function useChromeExtensionNotification(): void {
  useStartupNotification(async () => {
    const chromeFlag = getChromeFlag();
    if (!shouldEnableClaudeInChrome(chromeFlag)) return null;

    // Claude in Chrome is only supported for claude.ai subscribers (unless user is ant)
    if (process.env.USER_TYPE !== 'ant' && !isClaudeAISubscriber()) {
      return {
        key: 'chrome-requires-subscription',
        jsx: <T color="error">Claude in Chrome requires a claude.ai subscription</T>,
        priority: 'immediate',
        timeoutMs: 5000,
      };
    }

    const installed = await isChromeExtensionInstalled();
    if (!installed && !isRunningOnHomespace()) {
      // Skip notification on Homespace since Chrome setup requires different steps (see go/hsproxy)
      return {
        key: 'chrome-extension-not-detected',
        jsx: (
          <T color="warning" vars={{ url: 'https://claude.ai/chrome' }}>
            {'Chrome extension not detected · {url} to install'}
          </T>
        ),
        // TODO(hackyon): Lower the priority if the claude-in-chrome integration is no longer opt-in
        priority: 'immediate',
        timeoutMs: 3000,
      };
    }
    if (chromeFlag === undefined) {
      // Show low priority notification only when Chrome is enabled by default
      // (not explicitly enabled with --chrome or disabled with --no-chrome)
      return {
        key: 'claude-in-chrome-default-enabled',
        text: `Claude in Chrome enabled · /chrome`,
        priority: 'low',
      };
    }
    return null;
  });
}
