import type { TaskState } from '@song-catcher/shared';

import { cn } from '../../lib/cn';

import styles from './TaskStateBadge.module.css';

const STATES: Record<TaskState, { label: string; className: string | undefined }> = {
  waiting: { label: 'Waiting', className: styles.waiting },
  active: { label: 'Recording', className: styles.active },
  'mission accomplished': { label: 'Done', className: styles.done },
  failed: { label: 'Failed', className: styles.failed },
};

export function TaskStateBadge({ state }: { state: TaskState }) {
  const { label, className } = STATES[state];
  return (
    <span className={cn(styles.badge, className)}>
      <span className={styles.led} aria-hidden />
      {label}
    </span>
  );
}
