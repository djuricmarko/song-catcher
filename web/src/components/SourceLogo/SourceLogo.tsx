import type { TaskSource } from '@song-catcher/shared';

import styles from './SourceLogo.module.css';

export const SOURCE_NAMES: Record<TaskSource, string> = { youtube: 'YouTube', deezer: 'Deezer' };

function YoutubeMark() {
  return (
    <>
      <circle cx="12" cy="12" r="12" fill="#f03" />
      <rect x="5.5" y="7.5" width="13" height="9" rx="2.75" fill="#fff" />
      <path d="M10.4 9.7v4.6l4-2.3z" fill="#f03" />
    </>
  );
}

function DeezerMark() {
  return (
    <>
      <rect x="2" y="16" width="4.25" height="2.5" fill="#ff5a36" />
      <rect x="7.25" y="16" width="4.25" height="2.5" fill="#ffb400" />
      <rect x="7.25" y="12.5" width="4.25" height="2.5" fill="#ffb400" />
      <rect x="12.5" y="16" width="4.25" height="2.5" fill="#3ec46d" />
      <rect x="12.5" y="12.5" width="4.25" height="2.5" fill="#3ec46d" />
      <rect x="12.5" y="9" width="4.25" height="2.5" fill="#3ec46d" />
      <rect x="17.75" y="16" width="4.25" height="2.5" fill="#4a7bff" />
      <rect x="17.75" y="12.5" width="4.25" height="2.5" fill="#4a7bff" />
      <rect x="17.75" y="9" width="4.25" height="2.5" fill="#4a7bff" />
      <rect x="17.75" y="5.5" width="4.25" height="2.5" fill="#a238ff" />
    </>
  );
}

export function SourceLogo({ source, size = 14 }: { source: TaskSource; size?: number }) {
  return (
    <svg className={styles.logo} viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      {source === 'youtube' ? <YoutubeMark /> : <DeezerMark />}
    </svg>
  );
}

export function SourceLabel({ source, className }: { source: TaskSource; className?: string }) {
  return (
    <span className={className ?? styles.label}>
      <SourceLogo source={source} />
      {SOURCE_NAMES[source]}
    </span>
  );
}
