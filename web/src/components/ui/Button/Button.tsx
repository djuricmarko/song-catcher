import { Button as BaseButton } from '@base-ui/react/button';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import { cn } from '../../../lib/cn';

import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'quiet';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ComponentPropsWithoutRef<typeof BaseButton>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <BaseButton
      ref={ref}
      type={type}
      className={cn(styles.button, styles[variant], styles[size], className)}
      {...props}
    />
  );
});
