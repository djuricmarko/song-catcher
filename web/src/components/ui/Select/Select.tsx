import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';

import styles from './Select.module.css';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  'aria-label': string;
}

export function Select<T extends string>({ value, onValueChange, options, 'aria-label': ariaLabel }: SelectProps<T>) {
  return (
    <BaseSelect.Root
      value={value}
      items={options}
      onValueChange={(next) => {
        if (next !== null) {
          onValueChange(next);
        }
      }}
    >
      <BaseSelect.Trigger className={styles.trigger} aria-label={ariaLabel}>
        <BaseSelect.Value />
        <BaseSelect.Icon className={styles.icon}>
          <ChevronDown size={13} strokeWidth={1.75} aria-hidden />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className={styles.positioner}
          side="bottom"
          align="start"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
          <BaseSelect.Popup className={styles.popup}>
            {options.map((option) => (
              <BaseSelect.Item key={option.value} value={option.value} className={styles.item}>
                <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                <BaseSelect.ItemIndicator>
                  <Check size={12} aria-hidden />
                </BaseSelect.ItemIndicator>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
