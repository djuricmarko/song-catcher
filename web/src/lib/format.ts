const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** `1 file`, `3 files`. The plural defaults to the singular plus "s". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** A file size such as `3.4 MB`; empty for sizes that are unknown or zero. */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) {
    return '';
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${SIZE_UNITS[unit]}`;
}

/** The time of day of a timestamp, or a placeholder when it is not set. */
export function formatClockTime(timestamp: number): string {
  if (!timestamp) {
    return '--:--';
  }
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** A duration such as `42s` or `3m 07s`. */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/** A position in a list as two digits: `01`, `02`, … */
export function formatIndex(position: number): string {
  return String(position).padStart(2, '0');
}
