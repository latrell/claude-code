import React from 'react';
import { envDynamic } from 'src/utils/envDynamic.js';
import { Box, Text } from '@anthropic/ink';
import { useKeybindings } from '../keybindings/useKeybinding.js';
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js';
import { env } from '../utils/env.js';
import {
  getTerminalIdeType,
  type IDEExtensionInstallationStatus,
  isJetBrainsIde,
  toIDEDisplayName,
} from '../utils/ide.js';
import { t, tf } from '../i18n/t.js';
import { T } from '../i18n/TText.js';
import { Dialog } from '@anthropic/ink';

interface Props {
  onDone: () => void;
  installationStatus: IDEExtensionInstallationStatus | null;
}

export function IdeOnboardingDialog({ onDone, installationStatus }: Props): React.ReactNode {
  markDialogAsShown();

  // Handle Enter/Escape to dismiss
  useKeybindings(
    {
      'confirm:yes': onDone,
      'confirm:no': onDone,
    },
    { context: 'Confirmation' },
  );

  const ideType = installationStatus?.ideType ?? getTerminalIdeType();
  const isJetBrains = isJetBrainsIde(ideType);

  const ideName = toIDEDisplayName(ideType);
  const installedVersion = installationStatus?.installedVersion;
  const pluginOrExtension = isJetBrains ? 'plugin' : 'extension';
  const mentionShortcut = env.platform === 'darwin' ? 'Cmd+Option+K' : 'Ctrl+Alt+K';

  return (
    <>
      <Dialog
        title={
          <>
            <Text color="claude">{'\u272B'} </Text>
            <Text>{tf('Welcome to Claude Code for {ideName}', { ideName })}</Text>
          </>
        }
        subtitle={
          installedVersion
            ? tf('installed {pluginOrExtension} v{installedVersion}', {
                pluginOrExtension,
                installedVersion,
              })
            : undefined
        }
        color="ide"
        onCancel={onDone}
        hideInputGuide
      >
        <Box flexDirection="column" gap={1}>
          <Text>
            • <T>Claude has context of </T>
            <Text color="suggestion">
              ⧉<T> open files</T>
            </Text>
            <T> and </T>
            <Text color="suggestion">
              ⧉<T> selected lines</T>
            </Text>
          </Text>
          <Text>
            • <T>Review Claude Code&apos;s changes </T>
            <Text color="diffAddedWord">+11</Text> <Text color="diffRemovedWord">-22</Text>
            <T> in the comfort of your IDE</T>
          </Text>
          <Text>
            • Cmd+Esc
            <Text dimColor>
              <T> for Quick Launch</T>
            </Text>
          </Text>
          <Text>
            • {mentionShortcut}
            <Text dimColor>
              <T> to reference files or lines in your input</T>
            </Text>
          </Text>
        </Box>
      </Dialog>
      <Box paddingX={1}>
        <T dimColor italic>
          Press Enter to continue
        </T>
      </Box>
    </>
  );
}

export function hasIdeOnboardingDialogBeenShown(): boolean {
  const config = getGlobalConfig();
  const terminal = envDynamic.terminal || 'unknown';
  return config.hasIdeOnboardingBeenShown?.[terminal] === true;
}

function markDialogAsShown(): void {
  if (hasIdeOnboardingDialogBeenShown()) {
    return;
  }
  const terminal = envDynamic.terminal || 'unknown';
  saveGlobalConfig(current => ({
    ...current,
    hasIdeOnboardingBeenShown: {
      ...current.hasIdeOnboardingBeenShown,
      [terminal]: true,
    },
  }));
}
