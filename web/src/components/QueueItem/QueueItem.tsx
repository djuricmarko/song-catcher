import { Tooltip } from '@base-ui/react/tooltip';
import {
  AudioLines,
  CircleAlert,
  CircleCheck,
  CircleDotDashed,
  Clock,
  Database,
  DiscAlbum,
  File,
  ListMusic,
  LoaderCircle,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import type { QueueTask, TaskKind } from '@song-catcher/shared';

import { cn } from '../../lib/cn';
import { formatClockTime, formatDate, formatFileSize, pluralize } from '../../lib/format';
import { fileExtension } from '../../lib/paths';
import { SourceLabel } from '../SourceLogo';

import styles from './QueueItem.module.css';

const KIND_ICONS: Record<TaskKind, LucideIcon> = { track: AudioLines, album: DiscAlbum, playlist: ListMusic };

function StateMark({ task }: { task: QueueTask }) {
  switch (task.state) {
    case 'active': {
      const [current, maximum] = task.progress;
      return (
        <span className={styles.state}>
          {maximum > 1 ? (
            <svg
              className={styles.ring}
              viewBox="0 0 24 24"
              width={14}
              height={14}
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              aria-hidden
            >
              <circle cx={12} cy={12} r={10} />
              <circle
                cx={12}
                cy={12}
                r={10}
                pathLength={100}
                strokeDasharray={`${Math.min(100, (current / maximum) * 100)} 100`}
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <LoaderCircle size={14} strokeWidth={1.75} className={styles.spinner} aria-hidden />
          )}
          <span className="sr-only">Downloading</span>
        </span>
      );
    }
    case 'waiting':
      return (
        <span className={styles.state}>
          <CircleDotDashed size={14} strokeWidth={1.75} aria-hidden />
          <span className="sr-only">Waiting</span>
        </span>
      );
    case 'mission accomplished':
      return (
        <span className={cn(styles.state, styles.done)}>
          <CircleCheck size={14} strokeWidth={1.75} aria-hidden />
          Done
        </span>
      );
    case 'failed':
      return (
        <span className={cn(styles.state, styles.failed)}>
          <CircleAlert size={14} strokeWidth={1.75} aria-hidden />
          Failed
        </span>
      );
  }
}

function Detail({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <p className={styles.detail}>
      <Icon size={13} strokeWidth={1.75} aria-hidden />
      {children}
    </p>
  );
}

function Details({ task }: { task: QueueTask }) {
  const files = (task.result ?? []).filter((file) => fileExtension(file) !== 'm3u8');
  const extensions = [...new Set(files.map((file) => `.${fileExtension(file)}`))];
  const [current, maximum] = task.progress;

  return (
    <>
      <p className={styles.cardTitle}>{task.title}</p>
      <Detail icon={Clock}>{formatDate(task.date ?? task.tsQueued)}</Detail>
      <Detail icon={Wrench}>{task.source === 'youtube' ? 'yt-dlp' : 'Deezer'}</Detail>
      {extensions.length > 0 ? <Detail icon={File}>{extensions.join(', ')}</Detail> : null}
      {task.sizeBytes > 0 ? <Detail icon={Database}>{formatFileSize(task.sizeBytes)}</Detail> : null}
      {maximum > 1 ? <Detail icon={ListMusic}>{`${current} of ${pluralize(maximum, 'song')}`}</Detail> : null}
      {task.warnings.length > 0 ? (
        <Detail icon={TriangleAlert}>{`${pluralize(task.warnings.length, 'song')} skipped`}</Detail>
      ) : null}
      {task.exception ? <p className={styles.exception}>{task.exception}</p> : null}
    </>
  );
}

export function QueueItem({ task }: { task: QueueTask }) {
  const KindIcon = KIND_ICONS[task.kind];
  const subtitle = task.subtitle ?? (task.date ? formatDate(task.date) : `Queued ${formatClockTime(task.tsQueued)}`);

  return (
    <li>
      <Tooltip.Root>
        <Tooltip.Trigger
          delay={250}
          render={<div tabIndex={0} />}
          className={cn(styles.item, task.state === 'active' && styles.active)}
        >
          <span className={styles.head}>
            <SourceLabel source={task.source} className={styles.source} />
            <StateMark task={task} />
          </span>
          <span className={styles.title}>{task.title}</span>
          <span className={styles.foot}>
            <span className={styles.subtitle}>{subtitle}</span>
            <KindIcon size={14} strokeWidth={1.75} className={styles.kind} aria-hidden />
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Positioner side="right" align="start" sideOffset={24} className={styles.positioner}>
            <Tooltip.Popup className={styles.card}>
              <Details task={task} />
            </Tooltip.Popup>
          </Tooltip.Positioner>
        </Tooltip.Portal>
      </Tooltip.Root>
    </li>
  );
}
