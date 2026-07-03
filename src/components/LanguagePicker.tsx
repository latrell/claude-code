import figures from 'figures';
import React, { useState } from 'react';
import { Box, Text } from '@anthropic/ink';
import { useKeybinding } from '../keybindings/useKeybinding.js';
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

const OPTIONS: Option[] = [
  { label: 'English', value: undefined },
  { label: '简体中文', value: '简体中文' },
  { label: t('Custom input...'), value: '__custom__' },
];

const CUSTOM_SENTINEL = '__custom__';

export function LanguagePicker({ initialLanguage, onComplete, onCancel }: Props): React.ReactNode {
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
    { context: 'Settings' },
  );

  // Arrow key navigation in select phase
  useKeybinding(
    'confirm:previous',
    () => {
      if (phase === 'select') {
        setSelectedIndex(i => (i - 1 + OPTIONS.length) % OPTIONS.length);
      }
    },
    { context: 'Settings' },
  );

  useKeybinding(
    'confirm:next',
    () => {
      if (phase === 'select') {
        setSelectedIndex(i => (i + 1) % OPTIONS.length);
      }
    },
    { context: 'Settings' },
  );

  // Enter confirms selection
  useKeybinding(
    'confirm:yes',
    () => {
      if (phase === 'select') {
        const selected = OPTIONS[selectedIndex];
        if (selected === undefined) return;
        if (selected.value === CUSTOM_SENTINEL) {
          setPhase('custom');
          return;
        }
        onComplete(selected.value);
      }
    },
    { context: 'Settings' },
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
          {OPTIONS.map((option, index) => {
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
