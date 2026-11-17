import { Switch as BaseSwitch } from '@base-ui/react/switch';

import styles from './Switch.module.css';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  'aria-label': string;
}

export function Switch({ checked, onCheckedChange, 'aria-label': ariaLabel }: SwitchProps) {
  return (
    <BaseSwitch.Root
      checked={checked}
      onCheckedChange={(next) => {
        onCheckedChange(next);
      }}
      className={styles.root}
      aria-label={ariaLabel}
    >
      <BaseSwitch.Thumb className={styles.thumb} />
    </BaseSwitch.Root>
  );
}
