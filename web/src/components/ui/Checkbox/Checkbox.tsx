import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import type { ReactNode } from 'react';

import { cn } from '../../../lib/cn';

import styles from './Checkbox.module.css';

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({ checked, onCheckedChange, label, hint, disabled, className }: CheckboxProps) {
  return (
    <label className={cn(styles.label, disabled && styles.disabled, className)}>
      <BaseCheckbox.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => {
          onCheckedChange(next);
        }}
        className={styles.box}
      >
        <BaseCheckbox.Indicator className={styles.indicator}>
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
            <path d="M2 6.5 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
          </svg>
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span className={styles.text}>
        <span>{label}</span>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </span>
    </label>
  );
}
