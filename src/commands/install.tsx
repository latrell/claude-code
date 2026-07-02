import { homedir } from 'node:os';
import { join } from 'node:path';
import React, { useEffect, useState } from 'react';
import type { CommandResultDisplay } from 'src/commands.js';
import { logEvent } from 'src/services/analytics/index.js';
import { StatusIcon } from '@anthropic/ink';
import { Box, wrappedRender as render, Text } from '@anthropic/ink';
import { logForDebugging } from '../utils/debug.js';
import { env } from '../utils/env.js';
import { errorMessage } from '../utils/errors.js';
import { t, tf } from '../i18n/t.js';
import { T } from '../i18n/TText.js';
import {
  checkInstall,
  cleanupNpmInstallations,
  cleanupShellAliases,
  installLatest,
} from '../utils/nativeInstaller/index.js';
import { getInitialSettings, updateSettingsForSource } from '../utils/settings/settings.js';

interface InstallProps {
  onDone: (result: string, options?: { display?: CommandResultDisplay }) => void;
  force?: boolean;
  target?: string; // 'latest', 'stable', or version like '1.0.34'
}

type InstallState =
  | { type: 'checking' }
  | { type: 'cleaning-npm' }
  | { type: 'installing'; version: string }
  | { type: 'setting-up' }
  | { type: 'set-up'; messages: string[] }
  | { type: 'success'; version: string; setupMessages?: string[] }
  | { type: 'error'; message: string; warnings?: string[] };

function getInstallationPath(): string {
  const isWindows = env.platform === 'win32';
  const homeDir = homedir();

  if (isWindows) {
    // Convert to Windows-style path
    const windowsPath = join(homeDir, '.local', 'bin', 'claude.exe');
    // Replace forward slashes with backslashes for Windows display
    return windowsPath.replace(/\//g, '\\');
  }

  return '~/.local/bin/claude';
}

function SetupNotes({ messages }: { messages: string[] }): React.ReactNode {
  if (messages.length === 0) return null;

  return (
    <Box flexDirection="column" gap={0} marginBottom={1}>
      <Box>
        <Text color="warning">
          <StatusIcon status="warning" withSpace />
          {t('Setup notes:')}
        </Text>
      </Box>
      {messages.map((message, index) => (
        <Box key={index} marginLeft={2}>
          <Text dimColor>• {message}</Text>
        </Box>
      ))}
    </Box>
  );
}

function Install({ onDone, force, target }: InstallProps): React.ReactNode {
  const [state, setState] = useState<InstallState>({ type: 'checking' });

  useEffect(() => {
    async function run() {
      try {
        logForDebugging(`Install: Starting installation process (force=${force}, target=${target})`);

        // Install native build first
        const channelOrVersion = target || getInitialSettings()?.autoUpdatesChannel || 'latest';
        setState({ type: 'installing', version: channelOrVersion });

        // Pass force flag to trigger reinstall even if up to date
        logForDebugging(
          `Install: Calling installLatest(channelOrVersion=${channelOrVersion}, forceReinstall=${force})`,
        );
        const result = await installLatest(channelOrVersion, force);
        logForDebugging(
          `Install: installLatest returned version=${result.latestVersion}, wasUpdated=${result.wasUpdated}, lockFailed=${result.lockFailed}`,
        );

        // Check specifically for lock failure
        if (result.lockFailed) {
          throw new Error(
            t('Could not install - another process is currently installing Claude. Please try again in a moment.'),
          );
        }

        // If we couldn't get the version, there might be an issue
        if (!result.latestVersion) {
          logForDebugging('Install: Failed to retrieve version information during install', { level: 'error' });
        }

        if (!result.wasUpdated) {
          logForDebugging('Install: Already up to date');
        }

        // Set up launcher and shell integration
        setState({ type: 'setting-up' });
        const setupMessages = await checkInstall(true);

        logForDebugging(`Install: Setup launcher completed with ${setupMessages.length} messages`);
        if (setupMessages.length > 0) {
          setupMessages.forEach(msg => logForDebugging(`Install: Setup message: ${msg.message}`));
        }

        // Now that native installation succeeded, clean up old npm installations
        logForDebugging('Install: Cleaning up npm installations after successful install');
        const { removed, errors, warnings } = await cleanupNpmInstallations();

        if (removed > 0) {
          logForDebugging(`Cleaned up ${removed} npm installation(s)`);
        }

        if (errors.length > 0) {
          logForDebugging(`Cleanup errors: ${errors.join(', ')}`);
          // Continue despite cleanup errors - native install already succeeded
        }

        // Clean up old shell aliases
        const aliasMessages = await cleanupShellAliases();
        if (aliasMessages.length > 0) {
          logForDebugging(`Shell alias cleanup: ${aliasMessages.map(m => m.message).join('; ')}`);
        }

        // Log success event
        logEvent('tengu_claude_install_command', {
          has_version: result.latestVersion ? 1 : 0,
          forced: force ? 1 : 0,
        });

        // If user explicitly specified a channel, save it to settings
        if (target === 'latest' || target === 'stable') {
          updateSettingsForSource('userSettings', {
            autoUpdatesChannel: target,
          });
          logForDebugging(`Install: Saved autoUpdatesChannel=${target} to user settings`);
        }

        // Combine all warning/info messages (convert SetupMessage to string)
        const allWarnings = [...warnings, ...aliasMessages.map(m => m.message)];

        // Check if there were any setup errors or notes
        if (setupMessages.length > 0) {
          setState({
            type: 'set-up',
            messages: setupMessages.map(m => m.message),
          });
          // Still mark as success but show both setup messages and cleanup warnings
          setTimeout(setState, 2000, {
            type: 'success' as const,
            version: result.latestVersion || 'current',
            setupMessages: [...setupMessages.map(m => m.message), ...allWarnings],
          });
        } else {
          // No setup messages, go straight to success (but still show cleanup warnings if any)
          logForDebugging('Install: Shell PATH already configured');
          setState({
            type: 'success',
            version: result.latestVersion || 'current',
            setupMessages: allWarnings.length > 0 ? allWarnings : undefined,
          });
        }
      } catch (error) {
        logForDebugging(`Install command failed: ${error}`, {
          level: 'error',
        });
        setState({
          type: 'error',
          message: errorMessage(error),
        });
      }
    }

    void run();
  }, [force, target]);

  useEffect(() => {
    if (state.type === 'success') {
      // Give success message time to render before exiting
      setTimeout(onDone, 2000, t('Claude Code installation completed successfully'), {
        display: 'system' as const,
      });
    } else if (state.type === 'error') {
      // Give error message time to render before exiting
      setTimeout(onDone, 3000, t('Claude Code installation failed'), {
        display: 'system' as const,
      });
    }
  }, [state, onDone]);

  return (
    <Box flexDirection="column" marginTop={1}>
      {state.type === 'checking' && <T color="claude">Checking installation status...</T>}

      {state.type === 'cleaning-npm' && <T color="warning">Cleaning up old npm installations...</T>}

      {state.type === 'installing' && (
        <Text color="claude">{tf('Installing Claude Code native build {version}...', { version: state.version })}</Text>
      )}

      {state.type === 'setting-up' && <T color="claude">Setting up launcher and shell integration...</T>}

      {state.type === 'set-up' && <SetupNotes messages={state.messages} />}

      {state.type === 'success' && (
        <Box flexDirection="column" gap={1}>
          <Box>
            <StatusIcon status="success" withSpace />
            <T color="success" bold>
              Claude Code successfully installed!
            </T>
          </Box>
          <Box marginLeft={2} flexDirection="column" gap={1}>
            {state.version !== 'current' && (
              <Box>
                <T dimColor>Version: </T>
                <Text color="claude">{state.version}</Text>
              </Box>
            )}
            <Box>
              <T dimColor>Location: </T>
              <Text color="text">{getInstallationPath()}</Text>
            </Box>
          </Box>
          <Box marginLeft={2} flexDirection="column" gap={1}>
            <Box marginTop={1}>
              <T dimColor>Next: Run </T>
              <Text color="claude" bold>
                claude --help
              </Text>
              <T dimColor> to get started</T>
            </Box>
          </Box>
          {state.setupMessages && <SetupNotes messages={state.setupMessages} />}
        </Box>
      )}

      {state.type === 'error' && (
        <Box flexDirection="column" gap={1}>
          <Box>
            <StatusIcon status="error" withSpace />
            <T color="error">Installation failed</T>
          </Box>
          <Text color="error">{state.message}</Text>
          <Box marginTop={1}>
            <T dimColor>Try running with --force to override checks</T>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// This is only used from cli.tsx, not as a slash command
export const install = {
  type: 'local-jsx' as const,
  name: 'install',
  get description() {
    return t('Install Claude Code native build');
  },
  argumentHint: '[options]',
  async call(
    onDone: (result: string, options?: { display?: CommandResultDisplay }) => void,
    _context: unknown,
    args: string[],
  ) {
    // Parse arguments
    const force = args.includes('--force');
    const nonFlagArgs = args.filter(arg => !arg.startsWith('--'));
    const target = nonFlagArgs[0]; // 'latest', 'stable', or version like '1.0.34'

    const { unmount } = await render(
      <Install
        onDone={(result, options) => {
          unmount();
          onDone(result, options);
        }}
        force={force}
        target={target}
      />,
    );
  },
};
