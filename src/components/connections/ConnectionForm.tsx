import React, { useCallback, useState } from 'react';
import { Box, Text } from '@anthropic/ink';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { t } from '../../i18n/t.js';
import { useKeybinding } from '../../keybindings/useKeybinding.js';
import TextInput from '../TextInput.js';

export type ConnectionFormField = {
  key: string;
  label: string;
  placeholder?: string;
  mask?: boolean;
  required?: boolean;
  initialValue?: string;
  /** Locked fields render their value but are skipped during navigation. */
  locked?: boolean;
  /** Must parse as a URL when non-empty. */
  url?: boolean;
};

type Props = {
  title: string;
  subtitle?: string;
  fields: ConnectionFormField[];
  submitLabel?: string;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
  /** Error from the submit handler (validation happens outside too). */
  submitError?: string | null;
};

/**
 * Generic sequential text form for connection editing: one active TextInput
 * at a time, Up/Down/Tab to move, Enter advances (submits on the last
 * editable field), Esc cancels. Modeled on the ConsoleOAuthFlow forms.
 */
export function ConnectionForm({
  title,
  subtitle,
  fields,
  submitLabel,
  onSubmit,
  onCancel,
  submitError,
}: Props): React.ReactNode {
  const editable = fields.filter(f => !f.locked);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.key] = field.initialValue ?? '';
    }
    return initial;
  });
  const [activeKey, setActiveKey] = useState<string>(editable[0]?.key ?? '');
  const [cursorOffset, setCursorOffset] = useState<number>((editable[0]?.initialValue ?? '').length);
  const [error, setError] = useState<string | null>(null);

  const columns = useTerminalSize().columns - 22;
  const activeIndex = editable.findIndex(f => f.key === activeKey);

  const moveTo = useCallback(
    (index: number) => {
      const target = editable[index];
      if (!target) return;
      setActiveKey(target.key);
      setCursorOffset((values[target.key] ?? '').length);
    },
    [editable, values],
  );

  const validate = useCallback((): string | null => {
    for (const field of fields) {
      const value = (values[field.key] ?? '').trim();
      if (field.required && !value) {
        return `${field.label.trim()}: ${t('required')}`;
      }
      if (field.url && value) {
        try {
          new URL(value);
        } catch {
          return t('Invalid base URL: please enter a full URL including protocol (e.g., https://api.example.com)');
        }
      }
    }
    return null;
  }, [fields, values]);

  const handleEnter = useCallback(() => {
    if (activeIndex < editable.length - 1) {
      moveTo(activeIndex + 1);
      return;
    }
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    const trimmed: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      trimmed[key] = value.trim();
    }
    onSubmit(trimmed);
  }, [activeIndex, editable.length, moveTo, validate, values, onSubmit]);

  useKeybinding(
    'tabs:next',
    () => {
      if (activeIndex < editable.length - 1) moveTo(activeIndex + 1);
    },
    { context: 'FormField' },
  );
  useKeybinding(
    'tabs:previous',
    () => {
      if (activeIndex > 0) moveTo(activeIndex - 1);
    },
    { context: 'FormField' },
  );
  useKeybinding('confirm:no', onCancel, { context: 'Confirmation' });

  const labelWidth = Math.max(...fields.map(f => f.label.length)) + 1;

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{title}</Text>
      {subtitle ? <Text dimColor>{subtitle}</Text> : null}
      <Box flexDirection="column">
        {fields.map(field => {
          const active = field.key === activeKey;
          const value = values[field.key] ?? '';
          return (
            <Box key={field.key}>
              <Text
                backgroundColor={active ? 'suggestion' : undefined}
                color={active ? 'inverseText' : field.locked ? undefined : undefined}
              >
                {` ${field.label.padEnd(labelWidth)} `}
              </Text>
              <Text> </Text>
              {field.locked ? (
                <Text dimColor>{value}</Text>
              ) : active ? (
                <TextInput
                  value={value}
                  onChange={next => setValues(prev => ({ ...prev, [field.key]: next }))}
                  onSubmit={handleEnter}
                  cursorOffset={cursorOffset}
                  onChangeCursorOffset={setCursorOffset}
                  columns={columns}
                  mask={field.mask ? '*' : undefined}
                  placeholder={field.placeholder}
                  focus={true}
                />
              ) : value ? (
                <Text color="success">
                  {field.mask
                    ? value.slice(0, 6) + '\u00b7'.repeat(Math.max(0, Math.min(value.length - 6, 24)))
                    : value}
                </Text>
              ) : field.placeholder ? (
                <Text dimColor>{field.placeholder}</Text>
              ) : null}
            </Box>
          );
        })}
      </Box>
      {(error ?? submitError) ? <Text color="error">{error ?? submitError}</Text> : null}
      <Text dimColor>{submitLabel ?? t('↑↓/Tab to switch · Enter on last field to save · Esc to go back')}</Text>
    </Box>
  );
}
