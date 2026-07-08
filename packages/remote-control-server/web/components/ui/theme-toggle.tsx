import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme, type Theme } from '../../src/lib/theme';
import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { t } from '../../src/lib/i18n';

const themeOptions: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: t('Light'), icon: <Sun className="h-4 w-4" /> },
  { value: 'dark', label: t('Dark'), icon: <Moon className="h-4 w-4" /> },
  { value: 'system', label: t('System'), icon: <Monitor className="h-4 w-4" /> },
];

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          {resolvedTheme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          <span className="sr-only">{t('Toggle theme')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themeOptions.map(option => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={theme === option.value ? 'bg-accent' : ''}
          >
            {option.icon}
            <span className="ml-2">{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
