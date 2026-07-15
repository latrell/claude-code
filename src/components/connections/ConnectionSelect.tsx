import React from 'react';
import { Text } from '@anthropic/ink';
import { t } from '../../i18n/t.js';
import { Select, type SelectProps } from '../CustomSelect/select.js';

type Props<T> = Omit<SelectProps<T>, 'onCancel'> & {
  onBack: () => void;
};

/** Select used by hierarchical connection screens, with Esc-to-back navigation. */
export function ConnectionSelect<T>({ onBack, ...props }: Props<T>): React.ReactNode {
  return (
    <>
      <Select {...props} onCancel={onBack} />
      <Text dimColor>{`Esc ${t('go back')}`}</Text>
    </>
  );
}
