import React, { useCallback, useEffect, useState } from 'react';
import { gracefulShutdown } from 'src/utils/gracefulShutdown.js';
import { writeToStdout } from 'src/utils/process.js';
import { Box, color, Text, useTheme, Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink';
import { addMcpConfig, getAllMcpConfigs } from '../services/mcp/config.js';
import type { ConfigScope, McpServerConfig, ScopedMcpServerConfig } from '../services/mcp/types.js';
import { plural } from '../utils/stringUtils.js';
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js';
import { t, tf } from '../i18n/t.js';
import { T } from '../i18n/TText.js';
import { SelectMulti } from './CustomSelect/SelectMulti.js';

type Props = {
  servers: Record<string, McpServerConfig>;
  scope: ConfigScope;
  onDone(): void;
};

export function MCPServerDesktopImportDialog({ servers, scope, onDone }: Props): React.ReactNode {
  const serverNames = Object.keys(servers);
  const [existingServers, setExistingServers] = useState<Record<string, ScopedMcpServerConfig>>({});

  useEffect(() => {
    void getAllMcpConfigs().then(({ servers }) => setExistingServers(servers));
  }, []);

  const collisions = serverNames.filter(name => existingServers[name] !== undefined);

  async function onSubmit(selectedServers: string[]) {
    let importedCount = 0;

    for (const serverName of selectedServers) {
      const serverConfig = servers[serverName];
      if (serverConfig) {
        // If the server name already exists, find a new name with _1, _2, etc.
        let finalName = serverName;
        if (existingServers[finalName] !== undefined) {
          let counter = 1;
          while (existingServers[`${serverName}_${counter}`] !== undefined) {
            counter++;
          }
          finalName = `${serverName}_${counter}`;
        }

        await addMcpConfig(finalName, serverConfig, scope);
        importedCount++;
      }
    }

    done(importedCount);
  }

  const [theme] = useTheme();

  // Define done before using in useCallback
  const done = useCallback(
    (importedCount: number) => {
      if (importedCount > 0) {
        writeToStdout(
          `\n${color('success', theme)(`Successfully imported ${importedCount} MCP ${plural(importedCount, 'server')} to ${scope} config.`)}\n`,
        );
      } else {
        writeToStdout('\nNo servers were imported.');
      }
      onDone();

      void gracefulShutdown();
    },
    [theme, scope, onDone],
  );

  // Handle ESC to cancel (import 0 servers)
  const handleEscCancel = useCallback(() => {
    done(0);
  }, [done]);

  return (
    <>
      <Dialog
        title={t('Import MCP Servers from Claude Desktop')}
        subtitle={tf('Found {count} MCP {noun} in Claude Desktop.', {
          count: serverNames.length,
          noun: plural(serverNames.length, 'server'),
        })}
        color="success"
        onCancel={handleEscCancel}
        hideInputGuide
      >
        {collisions.length > 0 && (
          <T color="warning">
            Note: Some servers already exist with the same name. If selected, they will be imported with a numbered
            suffix.
          </T>
        )}
        <T>Please select the servers you want to import:</T>

        <SelectMulti
          options={serverNames.map(server => ({
            label: `${server}${collisions.includes(server) ? ' (already exists)' : ''}`,
            value: server,
          }))}
          defaultValue={serverNames.filter(name => !collisions.includes(name))} // Only preselect non-colliding servers
          onSubmit={onSubmit}
          onCancel={handleEscCancel}
          hideIndexes
        />
      </Dialog>
      <Box paddingX={1}>
        <Text dimColor italic>
          <Byline>
            <KeyboardShortcutHint shortcut="Space" action={t('select')} />
            <KeyboardShortcutHint shortcut="Enter" action={t('confirm')} />
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description={t('cancel')}
            />
          </Byline>
        </Text>
      </Box>
    </>
  );
}
