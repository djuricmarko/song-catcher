const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

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
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${SIZE_UNITS[unit] ?? ''}`;
}

export function formatClockTime(timestamp: number): string {
  if (!timestamp) {
    return '--:--';
  }
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatIndex(position: number): string {
  return String(position).padStart(2, '0');
}

export function formatDate(value: string | number): string {
  const date = typeof value === 'number' ? new Date(value) : new Date(`${value}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
