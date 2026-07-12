import figures from 'figures';
import React, { useMemo, useState } from 'react';
import { Box, Text } from '@anthropic/ink';
import { useKeybinding, useKeybindings } from '../keybindings/useKeybinding.js';
import TextInput from './TextInput.js';
import { T } from '../i18n/TText.js';
import { t } from '../i18n/t.js';

type Props = {
  initialLanguage: string | undefined;
  onComplete: (language: string | undefined) => void;
  onCancel: () => void;
};

type Option = {
  label: string;
  value: string | undefined;
};

const CUSTOM_SENTINEL = '__custom__';

/**
 * Compute option labels at render time so they reflect the current language.
 */
function getOptions(): Option[] {
  return [
    { label: 'English', value: undefined },
    { label: '简体中文', value: '简体中文' },
    { label: t('Custom input...'), value: CUSTOM_SENTINEL },
  ];
}

export function LanguagePicker({ initialLanguage, onComplete, onCancel }: Props): React.ReactNode {
  const options = useMemo(() => getOptions(), []);
  const [phase, setPhase] = useState<'select' | 'custom'>('select');
  const [selectedIndex, setSelectedIndex] = useState(() => {
    // Pre-select the option matching the current language
    if (initialLanguage === undefined) return 0;
    if (initialLanguage === '简体中文') return 1;
    return 2; // custom — any other value
  });
  const [customValue, setCustomValue] = useState(() => {
    if (initialLanguage === undefined || initialLanguage === '简体中文') return '';
    return initialLanguage;
  });
  const [cursorOffset, setCursorOffset] = useState(() => {
    if (initialLanguage === undefined || initialLanguage === '简体中文') return 0;
    return initialLanguage.length;
  });

  // ESC cancels back to select phase if in custom input, otherwise cancels the whole picker
  useKeybinding(
    'confirm:no',
    () => {
      if (phase === 'custom') {
        setPhase('select');
        return;
      }
      onCancel();
    },
    { context: 'Confirmation' },
  );

  // Arrow key navigation + Enter confirm in select phase.
  // confirm:* actions are bound to up/down/enter in the Confirmation context
  // (not Settings, where up/down resolve to select:* and enter to settings:close).
  // isActive gates these off in the custom phase so Enter reaches TextInput's onSubmit.
  useKeybindings(
    {
      'confirm:previous': () => {
        setSelectedIndex(i => (i - 1 + options.length) % options.length);
      },
      'confirm:next': () => {
        setSelectedIndex(i => (i + 1) % options.length);
      },
      'confirm:yes': () => {
        const selected = options[selectedIndex];
        if (selected === undefined) return;
        if (selected.value === CUSTOM_SENTINEL) {
          setPhase('custom');
          return;
        }
        onComplete(selected.value);
      },
    },
    { context: 'Confirmation', isActive: phase === 'select' },
  );

  function handleCustomSubmit(): void {
    const trimmed = customValue.trim();
    if (!trimmed) {
      // Empty custom input → treat as English
      onComplete(undefined);
    } else {
      onComplete(trimmed);
    }
  }

  // Phase 1: Select from 3 options
  if (phase === 'select') {
    return (
      <Box flexDirection="column" gap={1}>
        <T>Select your preferred language:</T>
        <Box flexDirection="column" gap={0}>
          {options.map((option, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Box key={option.label} flexDirection="row" gap={1}>
                <Text color={isSelected ? 'suggestion' : undefined}>{isSelected ? figures.pointer : ' '}</Text>
                <Text color={isSelected ? 'suggestion' : undefined}>{option.label}</Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  // Phase 2: Custom text input
  return (
    <Box flexDirection="column" gap={1}>
      <T>Enter your preferred response language:</T>
      <Box flexDirection="row" gap={1}>
        <Text>{figures.pointer}</Text>
        <TextInput
          value={customValue}
          onChange={setCustomValue}
          onSubmit={handleCustomSubmit}
          focus={true}
          showCursor={true}
          placeholder={`e.g., Japanese, 日本語, Español${figures.ellipsis}`}
          columns={60}
          cursorOffset={cursorOffset}
          onChangeCursorOffset={setCursorOffset}
        />
      </Box>
      <T dimColor>Leave empty for default (English)</T>
    </Box>
  );
}
