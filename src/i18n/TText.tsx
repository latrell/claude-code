import React from 'react';
import { Text } from '@anthropic/ink';
import type { TextProps } from '@anthropic/ink';
import { t, tf } from './t.js';

type TProps = Omit<TextProps, 'children'> & {
  /** The English UI string to render (used as translation key). */
  children: string;
  /** Optional placeholder variables for template substitution via `tf()`. */
  vars?: Record<string, string | number | boolean | null | undefined>;
};

/**
 * Translated Text component for Ink/React.
 *
 * Wraps `@anthropic/ink`'s `Text` component and automatically translates
 * the `children` string via `t()` or `tf()` depending on whether `vars` is
 * provided.
 *
 * Accepts all standard `Text` props (color, bold, dimColor, italic, wrap,
 * etc.).
 *
 * Example:
 *   <T bold>Settings</T>
 *   <T dimColor vars={{ count: 3 }}>You have {count} files</T>
 */
export function T({ children, vars, ...textProps }: TProps): React.ReactNode {
  const translated = vars ? tf(children, vars) : t(children);
  return <Text {...textProps}>{translated}</Text>;
}

export default T;
