import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { Theme } from '@anthropic/ink';
import { T } from '../../i18n/TText.js';

export type LocalVaultViewProps =
  | { mode: 'list'; keys: string[] }
  | { mode: 'set-ok'; key: string }
  | { mode: 'get-masked'; key: string; masked: string }
  | { mode: 'get-revealed'; key: string; value: string }
  | { mode: 'not-found'; key: string }
  | { mode: 'deleted'; key: string }
  | { mode: 'error'; message: string };

export function LocalVaultView(props: LocalVaultViewProps): React.ReactNode {
  if (props.mode === 'list') {
    if (props.keys.length === 0) {
      return (
        <Box>
          <T dimColor>{'No secrets stored. Use /local-vault set <key> <value> to add one.'}</T>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <T bold vars={{ count: props.keys.length }}>
            {'Local Vault Keys ({count})'}
          </T>
        </Box>
        {props.keys.map(k => (
          <Box key={k}>
            <Text> </Text>
            <Text color={'success' as keyof Theme}>●</Text>
            <Text> {k}</Text>
          </Box>
        ))}
      </Box>
    );
  }

  if (props.mode === 'set-ok') {
    return (
      <Box>
        <Text color={'success' as keyof Theme}>✓</Text>
        <T> Secret stored: </T>
        <Text bold>{props.key}</Text>
        <Text dimColor> = [REDACTED]</Text>
      </Box>
    );
  }

  if (props.mode === 'get-masked') {
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>{props.key}</Text>
          <Text dimColor>: </Text>
          <Text>{props.masked}</Text>
        </Box>
        <Box marginTop={1}>
          <T dimColor vars={{ key: props.key }}>
            {'Use /local-vault get {key} --reveal to see the full value.'}
          </T>
        </Box>
      </Box>
    );
  }

  if (props.mode === 'get-revealed') {
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>{props.key}</Text>
          <Text dimColor>: </Text>
          <Text color={'warning' as keyof Theme}>{props.value}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor color={'warning' as keyof Theme}>
            ⚠ Secret revealed in terminal — clear scrollback if this session is shared.
          </Text>
        </Box>
      </Box>
    );
  }

  if (props.mode === 'not-found') {
    return (
      <Box>
        <T color={'error' as keyof Theme}>Key not found: </T>
        <Text bold>{props.key}</Text>
      </Box>
    );
  }

  if (props.mode === 'deleted') {
    return (
      <Box>
        <Text color={'success' as keyof Theme}>✓</Text>
        <T> Deleted: </T>
        <Text bold>{props.key}</Text>
      </Box>
    );
  }

  // mode === 'error'
  return (
    <Box>
      <T color={'error' as keyof Theme} vars={{ error: props.message }}>
        {'Error: {error}'}
      </T>
    </Box>
  );
}
