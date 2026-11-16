import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadWindowState, restoreWindowBounds, saveWindowState, type WindowState } from '../src/window-state.js';

const display = { x: 0, y: 0, width: 1920, height: 1080 };
const fallback = { width: 1180, height: 800 };
const minimum = { width: 920, height: 560 };
const saved: WindowState = { x: 100, y: 50, width: 1400, height: 900, maximized: false };

describe('restoreWindowBounds', () => {
  it('reopens the window where it was left', () => {
    expect(restoreWindowBounds(saved, [display], fallback, minimum)).toEqual({
      x: 100,
      y: 50,
      width: 1400,
      height: 900,
    });
  });

  it('finds the window on a second display', () => {
    const second = { x: 1920, y: 0, width: 2560, height: 1440 };
    const onSecond = { ...saved, x: 2000 };
    expect(restoreWindowBounds(onSecond, [display, second], fallback, minimum)).toMatchObject({ x: 2000 });
  });

  it('allows the pixel of overhang a snapped window reports', () => {
    const snapped = { ...saved, x: -1, y: -1, width: 961, height: 1081 };
    expect(restoreWindowBounds(snapped, [display], fallback, minimum)).toMatchObject({ x: -1, width: 961 });
  });

  it('falls back to the default size when the display is gone or the window would be too small', () => {
    expect(restoreWindowBounds(undefined, [display], fallback, minimum)).toEqual(fallback);
    expect(restoreWindowBounds({ ...saved, x: 3000 }, [display], fallback, minimum)).toEqual(fallback);
    expect(restoreWindowBounds({ ...saved, width: 400 }, [display], fallback, minimum)).toEqual(fallback);
    expect(restoreWindowBounds(saved, [], fallback, minimum)).toEqual(fallback);
  });
});

describe('window state file', () => {
  it('round-trips through disk, creating the folder on the way', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'song-catcher-')), 'nested', 'window-state.json');
    saveWindowState(file, saved);
    expect(loadWindowState(file)).toEqual(saved);
  });

  it('ignores a missing or damaged file', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'song-catcher-')), 'window-state.json');
    expect(loadWindowState(file)).toBeUndefined();
    writeFileSync(file, '{"x":"left"}');
    expect(loadWindowState(file)).toBeUndefined();
  });
});
