import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Monitor, Moon, Sun } from 'lucide-react';

import { useTheme, type ThemePreference } from '../../hooks/useTheme';

import styles from './ThemeSwitch.module.css';

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'Auto', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
];

export function ThemeSwitch() {
  const { preference, setPreference } = useTheme();

  return (
    <ToggleGroup
      value={[preference]}
      onValueChange={(next) => {
        const [value] = next;
        if (value) {
          setPreference(value as ThemePreference);
        }
      }}
      className={styles.group}
      aria-label="Colour theme"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <Toggle
          key={value}
          value={value}
          aria-label={`${label} theme`}
          title={`${label} theme`}
          className={styles.item}
        >
          <Icon size={14} aria-hidden />
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
