import React from 'react';
import { Text } from '@anthropic/ink';
import { t } from '../../i18n/t.js';
import { Select, type SelectProps } from '../CustomSelect/select.js';

type Props<T> = Omit<SelectProps<T>, 'onLeftArrow'> & {
  onBack: () => void;
};

/** Select used by hierarchical connection screens, with left-arrow navigation. */
export function ConnectionSelect<T>({ onBack, ...props }: Props<T>): React.ReactNode {
  return (
    <>
      <Select {...props} onLeftArrow={onBack} />
      <Text dimColor>{`← ${t('go back')}`}</Text>
    </>
  );
}
