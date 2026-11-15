import { describe, expect, it } from 'vitest';

import { formatClockTime, formatDuration, formatFileSize, formatIndex, pluralize } from '../../src/lib/format';

describe('pluralize', () => {
  it('adds an "s" unless there is exactly one', () => {
    expect(pluralize(0, 'file')).toBe('0 files');
    expect(pluralize(1, 'file')).toBe('1 file');
    expect(pluralize(2, 'file')).toBe('2 files');
  });

  it('accepts an irregular plural', () => {
    expect(pluralize(1, 'entry', 'entries')).toBe('1 entry');
    expect(pluralize(3, 'entry', 'entries')).toBe('3 entries');
  });
});

describe('formatFileSize', () => {
  it('is empty for unknown sizes', () => {
    expect(formatFileSize(0)).toBe('');
    expect(formatFileSize(-1)).toBe('');
  });

  it('picks the largest fitting unit', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatFileSize(3 * 1024 ** 3)).toBe('3.0 GB');
  });

  it('stays at the largest unit for huge sizes', () => {
    expect(formatFileSize(2048 * 1024 ** 4)).toBe('2048.0 TB');
  });
});

describe('formatClockTime', () => {
  it('shows a placeholder for a missing timestamp', () => {
    expect(formatClockTime(0)).toBe('--:--');
  });

  it('shows hours, minutes and seconds', () => {
    const timestamp = new Date(2026, 0, 2, 13, 5, 9).getTime();
    expect(formatClockTime(timestamp)).toBe(
      new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    );
    expect(formatClockTime(timestamp)).toMatch(/05.*09/);
  });
});

describe('formatDuration', () => {
  it('uses seconds below a minute', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(1499)).toBe('1s');
    expect(formatDuration(59_000)).toBe('59s');
  });

  it('uses minutes and padded seconds from a minute on', () => {
    expect(formatDuration(60_000)).toBe('1m 00s');
    expect(formatDuration(187_000)).toBe('3m 07s');
  });

  it('never goes negative', () => {
    expect(formatDuration(-5000)).toBe('0s');
  });
});

describe('formatIndex', () => {
  it('pads to two digits', () => {
    expect(formatIndex(1)).toBe('01');
    expect(formatIndex(12)).toBe('12');
    expect(formatIndex(123)).toBe('123');
  });
});
