import { Collapsible } from '@base-ui/react/collapsible';
import { Progress } from '@base-ui/react/progress';
import { ChevronRight, FileAudio } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { QueueTask, TaskState } from '@song-catcher/shared';

import { Alert } from '../../components/Alert';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { TaskStateBadge } from '../../components/TaskStateBadge';
import { useQueue } from '../../hooks/useQueue';
import { cn } from '../../lib/cn';

import styles from './QueuePage.module.css';

const METER_SEGMENTS = 24;

function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

function formatTime(timestamp: number): string {
  if (!timestamp) {
    return '--:--';
  }
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(task: QueueTask): string | null {
  if (!task.tsStarted) {
    return null;
  }
  const end = task.tsFinished || Date.now();
  const seconds = Math.max(0, Math.round((end - task.tsStarted) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

const SUMMARY: Array<{ state: TaskState; label: string }> = [
  { state: 'active', label: 'Running' },
  { state: 'waiting', label: 'Waiting' },
  { state: 'mission accomplished', label: 'Done' },
  { state: 'failed', label: 'Failed' },
];

function Meter({ task }: { task: QueueTask }) {
  const [current, maximum] = task.progress;
  const value =
    maximum > 0 ? Math.min(100, (current / maximum) * 100) : task.state === 'mission accomplished' ? 100 : 0;
  const lit = Math.round((value / 100) * METER_SEGMENTS);

  return (
    <Progress.Root value={value} className={styles.meter} aria-label={`Progress of task ${task.id}`}>
      <Progress.Track className={cn(styles.meterTrack, task.state === 'failed' && styles.meterFailed)}>
        {Array.from({ length: METER_SEGMENTS }, (_, index) => (
          <span key={index} className={cn(styles.segment, index < lit && styles.segmentLit)} />
        ))}
      </Progress.Track>
      <span className={styles.meterValue}>
        {maximum > 0 ? `${current}/${maximum}` : task.state === 'waiting' ? 'idle' : '—'}
      </span>
    </Progress.Root>
  );
}

function TaskCard({ task }: { task: QueueTask }) {
  const duration = formatDuration(task);
  const files = task.result ?? [];

  return (
    <li className={cn(styles.task, task.state === 'active' && styles.taskActive)}>
      <div className={styles.taskHead}>
        <span className={styles.taskId}>#{String(task.id).padStart(3, '0')}</span>
        <div className={styles.taskMain}>
          <p className={styles.taskDescription}>{task.description}</p>
          <p className={styles.taskMeta}>
            <span>in {formatTime(task.tsQueued)}</span>
            {task.tsStarted ? <span>start {formatTime(task.tsStarted)}</span> : null}
            {task.tsFinished ? <span>end {formatTime(task.tsFinished)}</span> : null}
            {duration ? <span>{duration}</span> : null}
            {task.workerIndex !== null && task.workerIndex !== undefined ? (
              <span>worker {task.workerIndex}</span>
            ) : null}
          </p>
        </div>
        <TaskStateBadge state={task.state} />
      </div>

      <Meter task={task} />

      {task.exception ? <p className={styles.exception}>{task.exception}</p> : null}

      {task.warnings.length > 0 ? (
        <Collapsible.Root className={styles.collapsible}>
          <Collapsible.Trigger className={styles.collapsibleTrigger}>
            <ChevronRight size={14} className={styles.chevron} aria-hidden />
            {task.warnings.length} {task.warnings.length === 1 ? 'song' : 'songs'} skipped
          </Collapsible.Trigger>
          <Collapsible.Panel className={styles.collapsiblePanel}>
            <ul className={styles.warningList}>
              {task.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </Collapsible.Panel>
        </Collapsible.Root>
      ) : null}

      {!task.exception && files.length > 0 ? (
        <Collapsible.Root className={styles.collapsible}>
          <Collapsible.Trigger className={styles.collapsibleTrigger}>
            <ChevronRight size={14} className={styles.chevron} aria-hidden />
            {files.length} {files.length === 1 ? 'file' : 'files'} written
          </Collapsible.Trigger>
          <Collapsible.Panel className={styles.collapsiblePanel}>
            <ul className={styles.resultList}>
              {files.map((file) => (
                <li key={file}>
                  <FileAudio size={13} aria-hidden />
                  {basename(file)}
                </li>
              ))}
            </ul>
          </Collapsible.Panel>
        </Collapsible.Root>
      ) : null}
    </li>
  );
}

export function QueuePage() {
  const { tasks, connected, error } = useQueue();
  const counts = tasks.reduce<Record<string, number>>((accumulator, task) => {
    accumulator[task.state] = (accumulator[task.state] ?? 0) + 1;
    return accumulator;
  }, {});

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
        <ol className={styles.tasks}>
          {[...tasks].reverse().map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </ol>
      )}
    </div>
  );
}
