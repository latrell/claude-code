import React from 'react';
import { Text } from '@anthropic/ink';
import { Select } from './CustomSelect/index.js';
import { Dialog } from '@anthropic/ink';
import { t, tf } from '../i18n/t.js';
import { T } from '../i18n/TText.js';

export type ChannelDowngradeChoice = 'downgrade' | 'stay' | 'cancel';

type Props = {
  currentVersion: string;
  onChoice: (choice: ChannelDowngradeChoice) => void;
};

/**
 * Dialog shown when switching from latest to stable channel.
 * Allows user to choose whether to downgrade or stay on current version.
 */
export function ChannelDowngradeDialog({ currentVersion, onChoice }: Props): React.ReactNode {
  function handleSelect(value: ChannelDowngradeChoice): void {
    onChoice(value);
  }

  function handleCancel(): void {
    onChoice('cancel');
  }

  return (
    <Dialog title={t('Switch to Stable Channel')} onCancel={handleCancel} color="permission" hideBorder hideInputGuide>
      <Text>
        {tf("The stable channel may have an older version than what you're currently running ({currentVersion}).", {
          currentVersion,
        })}
      </Text>
      <T dimColor>How would you like to handle this?</T>
      <Select
        options={[
          {
            label: t('Allow possible downgrade to stable version'),
            value: 'downgrade' as ChannelDowngradeChoice,
          },
          {
            label: tf('Stay on current version ({currentVersion}) until stable catches up', {
              currentVersion,
            }),
            value: 'stay' as ChannelDowngradeChoice,
          },
        ]}
        onChange={handleSelect}
      />
    </Dialog>
  );
}
