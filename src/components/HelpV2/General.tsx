import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import { PromptInputHelpMenu } from '../PromptInput/PromptInputHelpMenu.js';
import { T } from '../../i18n/TText.js';

export function General(): React.ReactNode {
  return (
    <Box flexDirection="column" paddingY={1} gap={1}>
      <Box flexDirection="column" gap={1}>
        <T bold>Getting started</T>
        <Box flexDirection="column">
          <Text>
            <Text bold>1. </Text>
            <T>Ask a question or describe a task — Claude will explore your code and respond.</T>
          </Text>
          <Text>
            <Text bold>2. </Text>
            <T>When Claude wants to edit files or run commands, you review and approve each action.</T>
          </Text>
          <Text>
            <Text bold>3. </Text>
            <Text>Type </Text>
            <Text bold>/commit</Text>
            <Text> to commit changes, </Text>
            <Text bold>/help</Text>
            <Text> for commands, or </Text>
            <Text bold>?</Text>
            <Text> for shortcuts.</Text>
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column">
        <Box>
          <T bold>Shortcuts</T>
        </Box>
        <PromptInputHelpMenu gap={2} fixedWidth={true} />
      </Box>
    </Box>
  );
}
