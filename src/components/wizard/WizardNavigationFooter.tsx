import { type ReactNode } from 'react';
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js';
import { Box, Text } from '@anthropic/ink';
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js';
import { Byline, KeyboardShortcutHint } from '@anthropic/ink';
import { t, tf } from '../../i18n/t.js';

type Props = {
  instructions?: ReactNode;
};

export function WizardNavigationFooter({
  instructions = (
    <Byline>
      <KeyboardShortcutHint shortcut="↑↓" action={t('navigate')} />
      <KeyboardShortcutHint shortcut="Enter" action={t('select')} />
      <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description={t('go back')} />
    </Byline>
  ),
}: Props): ReactNode {
  const exitState = useExitOnCtrlCDWithKeybindings();

  return (
    <Box marginLeft={3} marginTop={1}>
      <Text dimColor>
        {exitState.pending ? tf('Press {key} again to exit', { key: exitState.keyName }) : instructions}
      </Text>
    </Box>
  );
}
