import figures from 'figures';
import React, { useEffect, useState } from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { Box, color, Text, useTheme } from '@anthropic/ink';
import { useMcpReconnect } from '../../services/mcp/MCPConnectionManager.js';
import { useAppStateStore } from '../../state/AppState.js';
import { Spinner } from '../Spinner.js';
import { t, tf } from '../../i18n/t.js';

type Props = {
  serverName: string;
  onComplete: (result?: string, options?: { display?: CommandResultDisplay }) => void;
};

export function MCPReconnect({ serverName, onComplete }: Props): React.ReactNode {
  const [theme] = useTheme();
  const store = useAppStateStore();
  const reconnectMcpServer = useMcpReconnect();
  const [isReconnecting, setIsReconnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function attemptReconnect() {
      try {
        // Check if server exists. Read via store.getState() instead of a
        // reactive selector so this effect does not re-fire when
        // reconnectMcpServer updates mcp.clients via onConnectionAttempt.
        const server = store.getState().mcp.clients.find(c => c.name === serverName);
        if (!server) {
          setError(tf('MCP server "{serverName}" not found', { serverName }));
          setIsReconnecting(false);
          onComplete(tf('MCP server "{serverName}" not found', { serverName }));
          return;
        }

        // Attempt reconnection
        const result = await reconnectMcpServer(serverName);

        switch (result.client.type) {
          case 'connected':
            setIsReconnecting(false);
            onComplete(tf('Successfully reconnected to {serverName}', { serverName }));
            break;
          case 'needs-auth':
            setError(tf('{serverName} requires authentication', { serverName }));
            setIsReconnecting(false);
            onComplete(tf('{serverName} requires authentication. Use /mcp to authenticate.', { serverName }));
            break;
          case 'pending':
          case 'failed':
          case 'disabled':
            setError(tf('Failed to reconnect to {serverName}', { serverName }));
            setIsReconnecting(false);
            onComplete(tf('Failed to reconnect to {serverName}', { serverName }));
            break;
        }
      } catch (err) {
        // Only catch actual errors (like server not found)
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        setIsReconnecting(false);
        onComplete(tf('Error: {errorMessage}', { errorMessage }));
      }
    }

    void attemptReconnect();
  }, [serverName, reconnectMcpServer, store, onComplete]);

  if (isReconnecting) {
    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Text color="text">
          {t('Reconnecting to ')}
          <Text bold>{serverName}</Text>
        </Text>
        <Box>
          <Spinner />
          <Text>{t(' Establishing connection to MCP server')}</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Box>
          <Text>{color('error', theme)(figures.cross)} </Text>
          <Text color="error">{tf('Failed to reconnect to {serverName}', { serverName })}</Text>
        </Box>
        <Text dimColor>{tf('Error: {error}', { error })}</Text>
      </Box>
    );
  }

  return null;
}
