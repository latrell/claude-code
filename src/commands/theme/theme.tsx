import * as React from 'react';
import type { CommandResultDisplay } from '../../commands.js';
import { Pane } from '@anthropic/ink';
import { ThemePicker } from '../../components/ThemePicker.js';
import { useTheme } from '@anthropic/ink';
import type { LocalJSXCommandCall } from '../../types/command.js';
import { tf, t } from '../../i18n/t.js';

type Props = {
  onDone: (result?: string, options?: { display?: CommandResultDisplay }) => void;
};

function ThemePickerCommand({ onDone }: Props): React.ReactNode {
  const [, setTheme] = useTheme();

  return (
    <Pane color="permission">
      <ThemePicker
        onThemeSelect={setting => {
          setTheme(setting);
          onDone(tf('Theme set to {setting}', { setting }));
        }}
        onCancel={() => {
          onDone(t('Theme picker dismissed'), { display: 'system' });
        }}
        skipExitHandling={true}
      />
    </Pane>
  );
}

export const call: LocalJSXCommandCall = async (onDone, _context) => {
  return <ThemePickerCommand onDone={onDone} />;
};
