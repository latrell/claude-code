import React from 'react';
import Text from '../components/Text.js';

type Props = {
  /** The key or chord to display (e.g., "ctrl+o", "Enter", "↑/↓") */
  shortcut: string;
  /** The action the key performs (e.g., "expand", "select", "navigate") */
  action: string;
  /** Whether to wrap the hint in parentheses. Default: false */
  parens?: boolean;
  /** Whether to render the shortcut in bold. Default: false */
  bold?: boolean;
  /**
   * Optional template string with {shortcut} and {action} placeholders.
   * Defaults to "{shortcut} to {action}" (or "({shortcut} to {action})" when parens).
   * Use this to localize the hint pattern, e.g. zh: "{shortcut} {action}".
   */
  template?: string;
};

/**
 * Module-level translation function set via setKeyboardShortcutTranslator().
 * When set, it is used to translate `action` labels and the default template.
 */
let _translateFn: ((s: string) => string) | undefined;

/**
 * Register a translation function for KeyboardShortcutHint.
 * Must be called once at app startup, e.g.:
 *   setKeyboardShortcutTranslator(t)   // where t is the i18n translate function
 *
 * When set, every KeyboardShortcutHint instance automatically:
 * 1. Translates the `action` string via _translateFn(action)
 * 2. Translates the default template "{shortcut} to {action}" when no
 *    explicit `template` prop is provided
 */
export function setKeyboardShortcutTranslator(fn: (s: string) => string): void {
  _translateFn = fn;
}

/**
 * Renders a keyboard shortcut hint like "ctrl+o to expand" or "(tab to toggle)"
 *
 * Wrap in <Text dimColor> for the common dim styling.
 *
 * When a translation function is registered (via setKeyboardShortcutTranslator),
 * the action string and default template are automatically translated. Callers
 * who supply an explicit `template` prop are responsible for translating it
 * themselves — the template is used as-is.
 *
 * @example
 * // Simple hint wrapped in dim Text
 * <Text dimColor><KeyboardShortcutHint shortcut="esc" action="cancel" /></Text>
 *
 * // With parentheses: "(ctrl+o to expand)"
 * <Text dimColor><KeyboardShortcutHint shortcut="ctrl+o" action="expand" parens /></Text>
 *
 * // With bold shortcut: "Enter to confirm" (Enter is bold)
 * <Text dimColor><KeyboardShortcutHint shortcut="Enter" action="confirm" bold /></Text>
 *
 * // Multiple hints with middot separator - use Byline
 * <Text dimColor>
 *   <Byline>
 *     <KeyboardShortcutHint shortcut="Enter" action="confirm" />
 *     <KeyboardShortcutHint shortcut="Esc" action="cancel" />
 *   </Byline>
 * </Text>
 */
export function KeyboardShortcutHint({
  shortcut,
  action,
  parens = false,
  bold = false,
  template,
}: Props): React.ReactNode {
  const t = _translateFn ?? ((s: string): string => s);
  const translatedAction = t(action);
  const shortcutText = bold ? <Text bold>{shortcut}</Text> : shortcut;

  // When a custom template is given, substitute {shortcut} and {action}
  // placeholders. The caller is responsible for translating the template
  // (or it's auto-translated at the caller level before being passed in).
  if (template) {
    const rendered = template.replace(/\{shortcut\}/g, shortcut).replace(/\{action\}/g, translatedAction);
    return <Text>{rendered}</Text>;
  }

  // Use translated default template
  const defaultTemplate = t('{shortcut} to {action}');
  const rendered = defaultTemplate.replace(/\{shortcut\}/g, shortcut).replace(/\{action\}/g, translatedAction);

  // When bold, the shortcut needs to be a React element, so we rebuild the
  // display from parts instead of using the plain-string rendered template.
  if (bold) {
    const preShortcut = defaultTemplate.substring(0, defaultTemplate.indexOf('{shortcut}'));
    const postShortcut = defaultTemplate.substring(defaultTemplate.indexOf('{shortcut}') + '{shortcut}'.length);
    const prePostRendered = postShortcut.replace(/\{action\}/g, translatedAction);
    const content = (
      <>
        {preShortcut}
        <Text bold>{shortcut}</Text>
        {prePostRendered}
      </>
    );
    if (parens) {
      return <Text>({content})</Text>;
    }
    return <Text>{content}</Text>;
  }

  if (parens) {
    return <Text>({rendered})</Text>;
  }
  return <Text>{rendered}</Text>;
}
