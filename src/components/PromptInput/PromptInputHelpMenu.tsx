import { feature } from 'bun:bundle';
import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import { getPlatform } from 'src/utils/platform.js';
import { isKeybindingCustomizationEnabled } from '../../keybindings/loadUserBindings.js';
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js';
import { isFastModeAvailable, isFastModeEnabled } from '../../utils/fastMode.js';
import { getNewlineInstructions } from './utils.js';
import { T } from '../../i18n/TText.js';

/** Format a shortcut for display in the help menu (e.g., "ctrl+o" → "ctrl + o") */
function formatShortcut(shortcut: string): string {
  return shortcut.replace(/\+/g, ' + ');
}

type Props = {
  dimColor?: boolean;
  fixedWidth?: boolean;
  gap?: number;
  paddingX?: number;
};

export function PromptInputHelpMenu(props: Props): React.ReactNode {
  const { dimColor, fixedWidth, gap, paddingX } = props;

  // Get configured shortcuts from keybinding system
  const transcriptShortcut = formatShortcut(useShortcutDisplay('app:toggleTranscript', 'Global', 'ctrl+o'));
  const todosShortcut = formatShortcut(useShortcutDisplay('app:toggleTodos', 'Global', 'ctrl+t'));
  const undoShortcut = formatShortcut(useShortcutDisplay('chat:undo', 'Chat', 'ctrl+_'));
  const stashShortcut = formatShortcut(useShortcutDisplay('chat:stash', 'Chat', 'ctrl+s'));
  const cycleModeShortcut = formatShortcut(useShortcutDisplay('chat:cycleMode', 'Chat', 'shift+tab'));
  const modelPickerShortcut = formatShortcut(useShortcutDisplay('chat:modelPicker', 'Chat', 'alt+p'));
  const fastModeShortcut = formatShortcut(useShortcutDisplay('chat:fastMode', 'Chat', 'alt+o'));
  const externalEditorShortcut = formatShortcut(useShortcutDisplay('chat:externalEditor', 'Chat', 'ctrl+g'));
  const terminalShortcut = formatShortcut(useShortcutDisplay('app:toggleTerminal', 'Global', 'meta+j'));
  const imagePasteShortcut = formatShortcut(useShortcutDisplay('chat:imagePaste', 'Chat', 'ctrl+v'));

  // Compute terminal shortcut element outside JSX to satisfy feature() constraint
  const terminalShortcutElement = feature('TERMINAL_PANEL') ? (
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_terminal_panel', false) ? (
      <Box>
        <T dimColor={dimColor} vars={{ shortcut: terminalShortcut }}>
          {'{shortcut} for terminal'}
        </T>
      </Box>
    ) : null
  ) : null;

  return (
    <Box paddingX={paddingX} flexDirection="row" gap={gap}>
      <Box flexDirection="column" width={fixedWidth ? 24 : undefined}>
        <Box>
          <T dimColor={dimColor}>! for bash mode</T>
        </Box>
        <Box>
          <T dimColor={dimColor}>/ for commands</T>
        </Box>
        <Box>
          <T dimColor={dimColor}>@ for file paths</T>
        </Box>
        <Box>
          <T dimColor={dimColor}>& for background</T>
        </Box>
        <Box>
          <T dimColor={dimColor}>/btw for side question</T>
        </Box>
      </Box>
      <Box flexDirection="column" width={fixedWidth ? 35 : undefined}>
        <Box>
          <T dimColor={dimColor}>double tap esc to clear input</T>
        </Box>
        <Box>
          <T dimColor={dimColor} vars={{ shortcut: cycleModeShortcut }}>
            {process.env.USER_TYPE === 'ant' ? '{shortcut} to cycle modes' : '{shortcut} to auto-accept edits'}
          </T>
        </Box>
        <Box>
          <T dimColor={dimColor} vars={{ shortcut: transcriptShortcut }}>
            {'{shortcut} for verbose output'}
          </T>
        </Box>
        <Box>
          <T dimColor={dimColor} vars={{ shortcut: todosShortcut }}>
            {'{shortcut} to toggle tasks'}
          </T>
        </Box>
        {terminalShortcutElement}
        <Box>
          <Text dimColor={dimColor}>{getNewlineInstructions()}</Text>
        </Box>
      </Box>
      <Box flexDirection="column">
        <Box>
          <T dimColor={dimColor} vars={{ shortcut: undoShortcut }}>
            {'{shortcut} to undo'}
          </T>
        </Box>
        {getPlatform() !== 'windows' && (
          <Box>
            <T dimColor={dimColor}>ctrl + z to suspend</T>
          </Box>
        )}
        <Box>
          <T dimColor={dimColor} vars={{ shortcut: imagePasteShortcut }}>
            {'{shortcut} to paste images'}
          </T>
        </Box>
        <Box>
          <T dimColor={dimColor} vars={{ shortcut: modelPickerShortcut }}>
            {'{shortcut} to switch model'}
          </T>
        </Box>
        {isFastModeEnabled() && isFastModeAvailable() && (
          <Box>
            <T dimColor={dimColor} vars={{ shortcut: fastModeShortcut }}>
              {'{shortcut} to toggle fast mode'}
            </T>
          </Box>
        )}
        <Box>
          <T dimColor={dimColor} vars={{ shortcut: stashShortcut }}>
            {'{shortcut} to stash prompt'}
          </T>
        </Box>
        <Box>
          <T dimColor={dimColor} vars={{ shortcut: externalEditorShortcut }}>
            {'{shortcut} to edit in $EDITOR'}
          </T>
        </Box>
        {isKeybindingCustomizationEnabled() && (
          <Box>
            <T dimColor={dimColor}>/keybindings to customize</T>
          </Box>
        )}
      </Box>
    </Box>
  );
}
