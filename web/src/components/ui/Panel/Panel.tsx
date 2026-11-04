import type { FormEventHandler, ReactNode } from 'react';

import { cn } from '../../../lib/cn';

import styles from './Panel.module.css';

interface PanelProps {
  as?: 'div' | 'section' | 'form';
  className?: string;
  children: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}

/** A bordered surface. Deliberately flat; depth comes from the border and paper tone. */
export function Panel({ as = 'div', className, children, onSubmit }: PanelProps) {
  if (as === 'form') {
    return (
      <form className={cn(styles.panel, className)} onSubmit={onSubmit}>
        {children}
      </form>
    );
  }
  const Component = as;
  return <Component className={cn(styles.panel, className)}>{children}</Component>;
}
