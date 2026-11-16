import { Toggle } from '@base-ui/react/toggle';
import { Check } from 'lucide-react';

import styles from './ToggleChip.module.css';

interface ToggleChipProps {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  label: string;
  title?: string;
}

export function ToggleChip({ pressed, onPressedChange, label, title }: ToggleChipProps) {
  return (
    <Toggle
      pressed={pressed}
      onPressedChange={(next) => {
        onPressedChange(next);
      }}
      className={styles.chip}
      title={title}
    >
      <span className={styles.box}>
        <Check size={9} strokeWidth={3} aria-hidden />
      </span>
      {label}
    </Toggle>
  );
}
