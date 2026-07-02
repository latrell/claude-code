import * as React from 'react';
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js';
import { Box, Text } from '@anthropic/ink';
import { tf } from '../../i18n/t.js';

type Props = {
  instructions?: string;
};

export function AgentNavigationFooter({
  instructions = 'Press ↑↓ to navigate · Enter to select · Esc to go back',
}: Props): React.ReactNode {
  const exitState = useExitOnCtrlCDWithKeybindings();

  return (
    <Box marginLeft={2}>
      <Text dimColor>
        {exitState.pending ? tf('Press {key} again to exit', { key: exitState.keyName }) : instructions}
      </Text>
    </Box>
  );
}
