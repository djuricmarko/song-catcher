import { Collapsible } from '@base-ui/react/collapsible';
import { Progress } from '@base-ui/react/progress';
import { ChevronRight, FileAudio } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { QueueTask, TaskState } from '@song-catcher/shared';

import { Alert } from '../../components/Alert';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { TaskStateBadge } from '../../components/TaskStateBadge';
import { useQueue } from '../../hooks/useQueue';
import { cn } from '../../lib/cn';
import { formatClockTime, formatDuration, pluralize } from '../../lib/format';
import { basename } from '../../lib/paths';

import styles from './QueuePage.module.css';

/** The progress meter is drawn as this many segments, like an LED level meter. */
const METER_SEGMENTS = 24;

const SUMMARY: Array<{ state: TaskState; label: string }> = [
  { state: 'active', label: 'Running' },
  { state: 'waiting', label: 'Waiting' },
  { state: 'mission accomplished', label: 'Done' },
  { state: 'failed', label: 'Failed' },
];

/** How long the task has been running, or ran in total; null before it starts. */
function taskDuration(task: QueueTask): string | null {
  if (!task.tsStarted) {
    return null;
  }
  const end = task.tsFinished || Date.now();
  return formatDuration(end - task.tsStarted);
}

/** Progress in percent. Tasks that never report progress jump from 0 to 100 when done. */
function progressPercent(task: QueueTask): number {
  const [current, maximum] = task.progress;
  if (maximum > 0) {
    return Math.min(100, (current / maximum) * 100);
  }
  return task.state === 'mission accomplished' ? 100 : 0;
}

function progressLabel(task: QueueTask): string {
  const [current, maximum] = task.progress;
  if (maximum > 0) {
    return `${current}/${maximum}`;
  }
  return task.state === 'waiting' ? 'idle' : '—';
}

function countByState(tasks: QueueTask[]): Partial<Record<TaskState, number>> {
  const counts: Partial<Record<TaskState, number>> = {};
  for (const task of tasks) {
    counts[task.state] = (counts[task.state] ?? 0) + 1;
  }
  return counts;
}

function Meter({ task }: { task: QueueTask }) {
  const percent = progressPercent(task);
  const litSegments = Math.round((percent / 100) * METER_SEGMENTS);

  return (
    <Progress.Root value={percent} className={styles.meter} aria-label={`Progress of task ${task.id}`}>
      <Progress.Track className={cn(styles.meterTrack, task.state === 'failed' && styles.meterFailed)}>
        {Array.from({ length: METER_SEGMENTS }, (_, index) => (
          <span key={index} className={cn(styles.segment, index < litSegments && styles.segmentLit)} />
        ))}
      </Progress.Track>
      <span className={styles.meterValue}>{progressLabel(task)}</span>
    </Progress.Root>
  );
}

/** A collapsed list that opens when its summary line is clicked. */
function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <Collapsible.Root className={styles.collapsible}>
      <Collapsible.Trigger className={styles.collapsibleTrigger}>
        <ChevronRight size={14} className={styles.chevron} aria-hidden />
        {summary}
      </Collapsible.Trigger>
      <Collapsible.Panel className={styles.collapsiblePanel}>{children}</Collapsible.Panel>
    </Collapsible.Root>
  );
}

function TaskCard({ task }: { task: QueueTask }) {
  const duration = taskDuration(task);
  const files = task.result ?? [];

  return (
    <li className={cn(styles.task, task.state === 'active' && styles.taskActive)}>
      <div className={styles.taskHead}>
        <span className={styles.taskId}>#{String(task.id).padStart(3, '0')}</span>
        <div className={styles.taskMain}>
          <p className={styles.taskDescription}>{task.description}</p>
          <p className={styles.taskMeta}>
            <span>in {formatClockTime(task.tsQueued)}</span>
            {task.tsStarted ? <span>start {formatClockTime(task.tsStarted)}</span> : null}
            {task.tsFinished ? <span>end {formatClockTime(task.tsFinished)}</span> : null}
            {duration ? <span>{duration}</span> : null}
            {typeof task.workerIndex === 'number' ? <span>worker {task.workerIndex}</span> : null}
          </p>
        </div>
        <TaskStateBadge state={task.state} />
      </div>

      <Meter task={task} />

      {task.exception ? <p className={styles.exception}>{task.exception}</p> : null}

      {task.warnings.length > 0 ? (
        <Disclosure summary={`${pluralize(task.warnings.length, 'song')} skipped`}>
          <ul className={styles.warningList}>
            {task.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </Disclosure>
      ) : null}

      {!task.exception && files.length > 0 ? (
        <Disclosure summary={`${pluralize(files.length, 'file')} written`}>
          <ul className={styles.resultList}>
            {files.map((file) => (
              <li key={file}>
                <FileAudio size={13} aria-hidden />
                {basename(file)}
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </li>
  );
}

export function QueuePage() {
  const { tasks, connected, error } = useQueue();
  const counts = countByState(tasks);

  return (
    <div>
      <PageHeader
        index="06"
        eyebrow="Queue"
        title={
          <>
            On the <em>turntable</em>
          </>
        }
        description="Waiting, running and finished downloads, streamed live. Finished tasks are kept in a short history."
        actions={
          <span className={cn(styles.live, connected && styles.liveOn)}>
            <span className={styles.liveDot} aria-hidden />
            {connected ? 'Live' : 'Reconnecting'}
          </span>
        }
      />

      {error ? <Alert>Could not load the queue: {error}</Alert> : null}

      {tasks.length > 0 ? (
        <dl className={styles.summary}>
          {SUMMARY.map(({ state, label }) => (
            <div key={state} className={styles.summaryItem}>
              <dt>{label}</dt>
              <dd>{counts[state] ?? 0}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState title="Nothing spinning yet">
          Start something from <Link to="/">Search</Link>, <Link to="/youtube">Video links</Link> or{' '}
          <Link to="/deezer">Playlists</Link>.
        </EmptyState>
      ) : (
        // Newest first.
        <ol className={styles.tasks}>
          {[...tasks].reverse().map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </ol>
      )}
    </div>
  );
}
