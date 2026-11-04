import { Input as BaseInput } from '@base-ui/react/input';
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';

import { cn } from '../../../lib/cn';

import styles from './Input.module.css';

export interface InputProps extends Omit<ComponentPropsWithoutRef<typeof BaseInput>, 'className' | 'size'> {
  className?: string;
  /** Optional leading adornment, usually an icon. */
  leading?: ReactNode;
  /** Optional trailing adornment, e.g. a keyboard hint. */
  trailing?: ReactNode;
  size?: 'md' | 'lg';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leading, trailing, size = 'md', ...props },
  ref,
) {
  return (
    <div className={cn(styles.field, styles[size], className)}>
      {leading ? <span className={styles.leading}>{leading}</span> : null}
      <BaseInput ref={ref} className={styles.input} {...props} />
      {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
    </div>
  );
});
