import React from 'react';
import { Text, Dialog } from '@anthropic/ink';
import { saveGlobalConfig } from '../utils/config.js';
import { t } from '../i18n/t.js';
import { T } from '../i18n/TText.js';
import { Select } from './CustomSelect/index.js';

type Props = {
  customApiKeyTruncated: string;
  onDone(approved: boolean): void;
};

export function ApproveApiKey({ customApiKeyTruncated, onDone }: Props): React.ReactNode {
  function onChange(value: 'yes' | 'no') {
    switch (value) {
      case 'yes': {
        saveGlobalConfig(current => ({
          ...current,
          customApiKeyResponses: {
            ...current.customApiKeyResponses,
            approved: [...(current.customApiKeyResponses?.approved ?? []), customApiKeyTruncated],
          },
        }));
        onDone(true);
        break;
      }
      case 'no': {
        saveGlobalConfig(current => ({
          ...current,
          customApiKeyResponses: {
            ...current.customApiKeyResponses,
            rejected: [...(current.customApiKeyResponses?.rejected ?? []), customApiKeyTruncated],
          },
        }));
        onDone(false);
        break;
      }
    }
  }

  return (
    <Dialog title={t('Detected a custom API key in your environment')} color="warning" onCancel={() => onChange('no')}>
      <Text>
        <Text bold>ANTHROPIC_API_KEY</Text>
        <Text>: sk-ant-...{customApiKeyTruncated}</Text>
      </Text>
      <T>Do you want to use this API key?</T>
      <Select
        defaultValue="no"
        defaultFocusValue="no"
        options={[
          { label: t('Yes'), value: 'yes' },
          {
            label: (
              <Text>
                {t('No')} (<T bold>recommended</T>)
              </Text>
            ),
            value: 'no',
          },
        ]}
        onChange={value => onChange(value as 'yes' | 'no')}
        onCancel={() => onChange('no')}
      />
    </Dialog>
  );
}
