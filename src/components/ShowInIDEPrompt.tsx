import { basename, relative } from 'path';
import React from 'react';
import { Box, Text, Pane } from '@anthropic/ink';
import { getCwd } from '../utils/cwd.js';
import { isSupportedVSCodeTerminal } from '../utils/ide.js';
import { Select } from './CustomSelect/index.js';
import { t, tf } from '../i18n/t.js';
import { T } from '../i18n/TText.js';
import type {
  PermissionOption,
  PermissionOptionWithLabel,
} from './permissions/FilePermissionDialog/permissionOptions.js';

type Props<A> = {
  filePath: string;
  input: A;
  onChange: (option: PermissionOption, args: A, feedback?: string) => void;
  options: PermissionOptionWithLabel[];
  ideName: string;
  symlinkTarget?: string | null;
  rejectFeedback: string;
  acceptFeedback: string;
  setFocusedOption: (value: string) => void;
  onInputModeToggle: (value: string) => void;
  focusedOption: string;
  yesInputMode: boolean;
  noInputMode: boolean;
};

export function ShowInIDEPrompt<A>({
  onChange,
  options,
  input,
  filePath,
  ideName,
  symlinkTarget,
  rejectFeedback,
  acceptFeedback,
  setFocusedOption,
  onInputModeToggle,
  focusedOption,
  yesInputMode,
  noInputMode,
}: Props<A>): React.ReactNode {
  return (
    <Pane color="permission">
      <Box flexDirection="column" gap={1}>
        <T bold color="permission" vars={{ ideName }}>
          Opened changes in {ideName} ⧉
        </T>
        {symlinkTarget && (
          <T color="warning" vars={{ symlinkTarget, relative: relative(getCwd(), symlinkTarget) }}>
            {relative(getCwd(), symlinkTarget).startsWith('..')
              ? `This will modify {symlinkTarget} (outside working directory) via a symlink`
              : `Symlink target: {symlinkTarget}`}
          </T>
        )}
        {isSupportedVSCodeTerminal() && <T dimColor>Save file to continue…</T>}
        <Box flexDirection="column">
          <Text>
            <T>Do you want to make this edit to </T>
            <Text bold>{basename(filePath)}</Text>
            <T>?</T>
          </Text>
          <Select
            options={options}
            inlineDescriptions
            onChange={value => {
              const selected = options.find(opt => opt.value === value);
              if (selected) {
                // For reject option
                if (selected.option.type === 'reject') {
                  const trimmedFeedback = rejectFeedback.trim();
                  onChange(selected.option, input, trimmedFeedback || undefined);
                  return;
                }
                // For accept-once option, pass accept feedback if present
                if (selected.option.type === 'accept-once') {
                  const trimmedFeedback = acceptFeedback.trim();
                  onChange(selected.option, input, trimmedFeedback || undefined);
                  return;
                }
                onChange(selected.option, input);
              }
            }}
            onCancel={() => onChange({ type: 'reject' }, input)}
            onFocus={value => setFocusedOption(value)}
            onInputModeToggle={onInputModeToggle}
          />
        </Box>
        <Box marginTop={1}>
          <T dimColor>Esc to cancel</T>
          {((focusedOption === 'yes' && !yesInputMode) || (focusedOption === 'no' && !noInputMode)) && (
            <T dimColor> · Tab to amend</T>
          )}
        </Box>
      </Box>
    </Pane>
  );
}
