import React from 'react';
import { Text, Dialog } from '@anthropic/ink';
import type { ValidationError } from '../utils/settings/validation.js';
import { t } from '../i18n/t.js';
import { T } from '../i18n/TText.js';
import { Select } from './CustomSelect/index.js';
import { ValidationErrorsList } from './ValidationErrorsList.js';

type Props = {
  settingsErrors: ValidationError[];
  onContinue: () => void;
  onExit: () => void;
};

/**
 * Dialog shown when settings files have validation errors.
 * User must choose to continue (skipping invalid files) or exit to fix them.
 */
export function InvalidSettingsDialog({ settingsErrors, onContinue, onExit }: Props): React.ReactNode {
  function handleSelect(value: string): void {
    if (value === 'exit') {
      onExit();
    } else {
      onContinue();
    }
  }

  return (
    <Dialog title={t('Settings Error')} onCancel={onExit} color="warning">
      <ValidationErrorsList errors={settingsErrors} />
      <T dimColor>Files with errors are skipped entirely, not just the invalid settings.</T>
      <Select
        options={[
          { label: t('Exit and fix manually'), value: 'exit' },
          {
            label: t('Continue without these settings'),
            value: 'continue',
          },
        ]}
        onChange={handleSelect}
      />
    </Dialog>
  );
}
