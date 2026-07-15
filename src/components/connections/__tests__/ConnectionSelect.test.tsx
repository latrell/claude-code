import { expect, test } from 'bun:test';
import React from 'react';
import { Select, type SelectProps } from '../../CustomSelect/select.js';
import { ConnectionSelect } from '../ConnectionSelect.js';

test('ConnectionSelect routes Esc to the back action without binding left arrow', () => {
  const onBack = () => {};
  const output = ConnectionSelect({
    options: [{ label: 'item', value: 'item' }],
    onBack,
  });

  expect(React.isValidElement(output)).toBe(true);
  const fragment = output as React.ReactElement<{ children: React.ReactNode }>;
  const children = React.Children.toArray(fragment.props.children);
  const select = children[0] as React.ReactElement<SelectProps<string>>;

  expect(select.type).toBe(Select);
  expect('onLeftArrow' in select.props).toBe(false);
  expect(select.props.onCancel).toBe(onBack);
});
