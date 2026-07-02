import React from 'react';
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js';
import { Box, Text } from '@anthropic/ink';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import type { SettingsJson } from '../../utils/settings/types.js';
import { t } from '../../i18n/t.js';
import { T } from '../../i18n/TText.js';
import { Select } from '../CustomSelect/index.js';
import { PermissionDialog } from '../permissions/PermissionDialog.js';
import { extractDangerousSettings, formatDangerousSettingsList } from './utils.js';

type Props = {
  settings: SettingsJson;
  onAccept: () => void;
  onReject: () => void;
};

export function ManagedSettingsSecurityDialog({ settings, onAccept, onReject }: Props): React.ReactNode {
  const dangerous = extractDangerousSettings(settings);
  const settingsList = formatDangerousSettingsList(dangerous);

  const exitState = useExitOnCtrlCDWithKeybindings();

  useKeybinding('confirm:no', onReject, { context: 'Confirmation' });

  function onChange(value: 'accept' | 'exit'): void {
    if (value === 'exit') {
      onReject();
      return;
    }
    onAccept();
  }

  return (
    <PermissionDialog color="warning" titleColor="warning" title={t('Managed settings require approval')}>
      <Box flexDirection="column" gap={1} paddingTop={1}>
        <T>
          Your organization has configured managed settings that could allow execution of arbitrary code or interception
          of your prompts and responses.
        </T>

        <Box flexDirection="column">
          <T dimColor>Settings requiring approval:</T>
          {settingsList.map((item, index) => (
            <Box key={index} paddingLeft={2}>
              <Text>
                <Text dimColor>· </Text>
                <Text>{item}</Text>
              </Text>
            </Box>
          ))}
        </Box>

        <T>
          Only accept if you trust your organization&apos;s IT administration and expect these settings to be
          configured.
        </T>

        <Select
          options={[
            { label: t('Yes, I trust these settings'), value: 'accept' },
            { label: t('No, exit Claude Code'), value: 'exit' },
          ]}
          onChange={value => onChange(value as 'accept' | 'exit')}
          onCancel={() => onChange('exit')}
        />

        <Text dimColor>
          {exitState.pending ? (
            <T vars={{ keyName: exitState.keyName }}>{'Press {keyName} again to exit'}</T>
          ) : (
            <T>Enter to confirm · Esc to exit</T>
          )}
        </Text>
      </Box>
    </PermissionDialog>
  );
}
