import type { TaskState } from '@deezer-downloader/shared';

const STATE_CLASSES: Record<TaskState, string> = {
  waiting: 'bg-amber-100 text-amber-800',
  active: 'bg-sky-100 text-sky-800',
  'mission accomplished': 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
};

export function TaskStateBadge({ state }: { state: TaskState }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATE_CLASSES[state]}`}
    >
      {state}
    </span>
  );
}
