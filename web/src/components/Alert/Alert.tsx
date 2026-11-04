import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

import styles from './Alert.module.css';

interface AlertProps {
  className?: string;
  children: ReactNode;
}

/** Inline error banner. */
export function Alert({ className, children }: AlertProps) {
  return (
    <div role="alert" className={cn(styles.alert, className)}>
      <TriangleAlert size={16} style={{ color: 'var(--bad)', flexShrink: 0, marginTop: 2 }} aria-hidden />
      <div>{children}</div>
    </div>
  );
}
