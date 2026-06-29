import * as React from 'react';
import { Box, Dialog, Text } from '@anthropic/ink';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js';
import { ConsoleOAuthFlow } from '../../components/ConsoleOAuthFlow.js';
import { SUBAGENT_CREDENTIAL_SCOPE } from '../../utils/model/subagentProvider.js';

export async function call(onDone: LocalJSXCommandOnDone): Promise<React.ReactNode> {
  return <SubagentLogin onDone={onDone} />;
}

function SubagentLogin(props: { onDone: LocalJSXCommandOnDone }): React.ReactNode {
  return (
    <Dialog
      title="Subagent Login"
      onCancel={() => props.onDone('Subagent login interrupted')}
      color="permission"
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : (
          <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="cancel" />
        )
      }
    >
      <Box flexDirection="column">
        <ConsoleOAuthFlow
          onDone={() => props.onDone('Subagent login successful')}
          startingMessage="Configure a provider/account for Agent sub-sessions. The main session login will not be changed."
          scope={SUBAGENT_CREDENTIAL_SCOPE}
        />
      </Box>
    </Dialog>
  );
}
