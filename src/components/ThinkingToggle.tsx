import * as React from 'react';
import { useState } from 'react';
import { useExitOnCtrlCDWithKeybindings } from 'src/hooks/useExitOnCtrlCDWithKeybindings.js';
import { Box, Text } from '@anthropic/ink';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js';
import { Select } from './CustomSelect/index.js';
import { Byline, KeyboardShortcutHint, Pane } from '@anthropic/ink';
import { t, tf } from '../i18n/t.js';
import { T } from '../i18n/TText.js';

export type Props = {
  currentValue: boolean;
  onSelect: (enabled: boolean) => void;
  onCancel?: () => void;
  isMidConversation?: boolean;
};

export function ThinkingToggle({ currentValue, onSelect, onCancel, isMidConversation }: Props): React.ReactNode {
  const exitState = useExitOnCtrlCDWithKeybindings();
  const [confirmationPending, setConfirmationPending] = useState<boolean | null>(null);

  const options = [
    {
      value: 'true',
      label: t('Enabled'),
      description: t('Claude will think before responding'),
    },
    {
      value: 'false',
      label: t('Disabled'),
      description: t('Claude will respond without extended thinking'),
    },
  ];

  // Use configurable keybinding for ESC to cancel/go back
  useKeybinding(
    'confirm:no',
    () => {
      if (confirmationPending !== null) {
        setConfirmationPending(null);
      } else {
        onCancel?.();
      }
    },
    { context: 'Confirmation' },
  );

  // Use configurable keybinding for Enter to confirm in confirmation mode
  useKeybinding(
    'confirm:yes',
    () => {
      if (confirmationPending !== null) {
        onSelect(confirmationPending);
      }
    },
    { context: 'Confirmation', isActive: confirmationPending !== null },
  );

  function handleSelectChange(value: string): void {
    const selected = value === 'true';
    if (isMidConversation && selected !== currentValue) {
      setConfirmationPending(selected);
    } else {
      onSelect(selected);
    }
  }

  return (
    <Pane color="permission">
      <Box flexDirection="column">
        <Box marginBottom={1} flexDirection="column">
          <T color="remember" bold>
            Toggle thinking mode
          </T>
          <Text dimColor>{t('Enable or disable thinking for this session.')}</Text>
        </Box>

        {confirmationPending !== null ? (
          <Box flexDirection="column" marginBottom={1} gap={1}>
            <T color="warning">
              Changing thinking mode mid-conversation will increase latency and may reduce quality. For best results,
              set this at the start of a session.
            </T>
            <T color="warning">Do you want to proceed?</T>
          </Box>
        ) : (
          <Box flexDirection="column" marginBottom={1}>
            <Select
              defaultValue={currentValue ? 'true' : 'false'}
              defaultFocusValue={currentValue ? 'true' : 'false'}
              options={options}
              onChange={handleSelectChange}
              onCancel={onCancel ?? (() => {})}
              visibleOptionCount={2}
            />
          </Box>
        )}
      </Box>
      <Text dimColor italic>
        {exitState.pending ? (
          <>{tf('Press {key} again to exit', { key: exitState.keyName })}</>
        ) : confirmationPending !== null ? (
          <Byline>
            <KeyboardShortcutHint shortcut="Enter" action="confirm" />
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description={t('cancel')}
            />
          </Byline>
        ) : (
          <Byline>
            <KeyboardShortcutHint shortcut="Enter" action="confirm" />
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description={t('exit')}
            />
          </Byline>
        )}
      </Text>
    </Pane>
  );
}
