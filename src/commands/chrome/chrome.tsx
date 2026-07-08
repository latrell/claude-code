import React, { useState } from 'react';
import { type OptionWithDescription, Select } from '../../components/CustomSelect/select.js';
import { Dialog } from '@anthropic/ink';
import { Box, Text } from '@anthropic/ink';
import { useAppState } from '../../state/AppState.js';
import { isClaudeAISubscriber } from '../../utils/auth.js';
import { openBrowser } from '../../utils/browser.js';
import { CLAUDE_IN_CHROME_MCP_SERVER_NAME, openInChrome } from '../../utils/claudeInChrome/common.js';
import { t } from '../../i18n/t.js';
import { T } from '../../i18n/TText.js';
import { isChromeExtensionInstalled } from '../../utils/claudeInChrome/setup.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
import { env } from '../../utils/env.js';
import { isRunningOnHomespace } from '../../utils/envUtils.js';

const CHROME_EXTENSION_URL = 'https://claude.ai/chrome';
const CHROME_PERMISSIONS_URL = 'https://clau.de/chrome/permissions';
const CHROME_RECONNECT_URL = 'https://clau.de/chrome/reconnect';

type MenuAction = 'install-extension' | 'reconnect' | 'manage-permissions' | 'toggle-default';

type Props = {
  onDone: (result?: string) => void;
  isExtensionInstalled: boolean;
  configEnabled: boolean | undefined;
  isClaudeAISubscriber: boolean;
  isWSL: boolean;
};

function ClaudeInChromeMenu({
  onDone,
  isExtensionInstalled: installed,
  configEnabled,
  isClaudeAISubscriber,
  isWSL,
}: Props): React.ReactNode {
  const mcpClients = useAppState(s => s.mcp.clients);
  const [selectKey, setSelectKey] = useState(0);
  const [enabledByDefault, setEnabledByDefault] = useState(configEnabled ?? false);
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [isExtensionInstalled, setIsExtensionInstalled] = useState(installed);

  const isHomespace = process.env.USER_TYPE === 'ant' && isRunningOnHomespace();

  const chromeClient = mcpClients.find(c => c.name === CLAUDE_IN_CHROME_MCP_SERVER_NAME);
  const isConnected = chromeClient?.type === 'connected';

  function openUrl(url: string): void {
    if (isHomespace) {
      void openBrowser(url);
    } else {
      void openInChrome(url);
    }
  }

  function handleAction(action: MenuAction): void {
    switch (action) {
      case 'install-extension':
        setSelectKey(k => k + 1);
        setShowInstallHint(true);
        openUrl(CHROME_EXTENSION_URL);
        break;
      case 'reconnect':
        setSelectKey(k => k + 1);
        void isChromeExtensionInstalled().then(installed => {
          setIsExtensionInstalled(installed);
          if (installed) {
            setShowInstallHint(false);
          }
        });
        openUrl(CHROME_RECONNECT_URL);
        break;
      case 'manage-permissions':
        setSelectKey(k => k + 1);
        openUrl(CHROME_PERMISSIONS_URL);
        break;
      case 'toggle-default': {
        const newValue = !enabledByDefault;
        saveGlobalConfig(current => ({
          ...current,
          claudeInChromeDefaultEnabled: newValue,
        }));
        setEnabledByDefault(newValue);
        break;
      }
    }
  }

  const options: OptionWithDescription<MenuAction>[] = [];
  const requiresExtensionSuffix = isExtensionInstalled ? '' : ' (requires extension)';

  if (!isExtensionInstalled && !isHomespace) {
    options.push({
      label: t('Install Chrome extension'),
      value: 'install-extension',
    });
  }

  options.push(
    {
      label: (
        <>
          <T>Manage permissions</T>
          <Text dimColor>{requiresExtensionSuffix}</Text>
        </>
      ),
      value: 'manage-permissions',
    },
    {
      label: (
        <>
          <T>Reconnect extension</T>
          <Text dimColor>{requiresExtensionSuffix}</Text>
        </>
      ),
      value: 'reconnect',
    },
    {
      label: `默认启用：${enabledByDefault ? t('Yes') : t('No')}`,
      value: 'toggle-default',
    },
  );

  const isDisabled = isWSL || ((process.env.USER_TYPE as string) !== 'ant' && !isClaudeAISubscriber);

  return (
    <Dialog title={t('Claude in Chrome (Beta)')} onCancel={() => onDone()} color="chromeYellow">
      <Box flexDirection="column" gap={1}>
        <T>
          Claude in Chrome works with the Chrome extension to let you control your browser directly from Claude Code.
          Navigate websites, fill forms, capture screenshots, record GIFs, and debug with console logs and network
          requests.
        </T>

        {isWSL && <T color="error">Claude in Chrome is not supported in WSL at this time.</T>}

        {(process.env.USER_TYPE as string) !== 'ant' && !isClaudeAISubscriber && (
          <T color="error">Claude in Chrome requires a claude.ai subscription.</T>
        )}

        {!isDisabled && (
          <>
            {!isHomespace && (
              <Box flexDirection="column">
                <Text>
                  {t('Status: ')}
                  {isConnected ? <T color="success">Enabled</T> : <T color="inactive">Disabled</T>}
                </Text>
                <Text>
                  Extension:{' '}
                  {isExtensionInstalled ? <T color="success">Installed</T> : <T color="warning">Not detected</T>}
                </Text>
              </Box>
            )}
            <Select key={selectKey} options={options} onChange={handleAction} hideIndexes />

            {showInstallHint && <T color="warning">Once installed, select "Reconnect extension" to connect.</T>}

            <Text>
              <T dimColor>Usage: </T>
              <Text>claude --chrome</Text>
              <T dimColor> or </T>
              <Text>claude --no-chrome</Text>
            </Text>

            <T dimColor>
              Site-level permissions are inherited from the Chrome extension. Manage permissions in the Chrome extension
              settings to control which sites Claude can browse, click, and type on.
            </T>
          </>
        )}
        <T dimColor vars={{ url: 'https://code.claude.com/docs/en/chrome' }}>
          {'Learn more: {url}'}
        </T>
      </Box>
    </Dialog>
  );
}

export const call = async function (onDone: (result?: string) => void): Promise<React.ReactNode> {
  const isExtensionInstalled = await isChromeExtensionInstalled();
  const config = getGlobalConfig();
  const isSubscriber = isClaudeAISubscriber();
  const isWSL = env.isWslEnvironment();

  return (
    <ClaudeInChromeMenu
      onDone={onDone}
      isExtensionInstalled={isExtensionInstalled}
      configEnabled={config.claudeInChromeDefaultEnabled}
      isClaudeAISubscriber={isSubscriber}
      isWSL={isWSL}
    />
  );
};
