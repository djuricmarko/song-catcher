import type { ReactNode } from 'react';

import styles from './EmptyState.module.css';

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
}

/** Empty placeholder drawn as a blank cassette label. */
export function EmptyState({ title, children }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <svg className={styles.art} viewBox="0 0 120 76" aria-hidden>
        <rect x="1" y="1" width="118" height="74" rx="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x="14" y="12" width="92" height="30" rx="3" fill="none" stroke="currentColor" strokeDasharray="3 3" />
        <circle cx="38" cy="27" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="82" cy="27" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M30 75 36 58h48l6 17" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <p className={styles.title}>{title}</p>
      {children ? <div className={styles.text}>{children}</div> : null}
    </div>
  );
}
