import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import type { ReactNode } from 'react';

import { cn } from '../../../lib/cn';

import styles from './Segmented.module.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  className?: string;
  'aria-label': string;
}

/** Single-choice segmented switch built on Base UI's ToggleGroup. */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => {
        const [selected] = next;
        if (selected) {
          onValueChange(selected as T);
        }
      }}
      className={cn(styles.group, className)}
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <Toggle key={option.value} value={option.value} className={styles.item}>
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
