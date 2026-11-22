import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { childEnvironment, childStderr, wasKilled } from '../src/lib/child-process.js';
import { errorMessage } from '../src/lib/errors.js';
import { isNonEmptyFile, removeQuietly, temporaryPathFor } from '../src/lib/files.js';
import { toPosixPath } from '../src/lib/paths.js';
import { cumulativeTransfer, type TransferSample } from '../src/lib/transfer.js';

describe('errorMessage', () => {
  it('uses the message of an Error and the string form of anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain')).toBe('plain');
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(undefined)).toBe('undefined');
  });
});

describe('child process helpers', () => {
  const original = process.env.DEEZER_COOKIE_ARL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DEEZER_COOKIE_ARL;
    } else {
      process.env.DEEZER_COOKIE_ARL = original;
    }
  });

  it('hides the ARL from child processes without touching the own environment', () => {
    process.env.DEEZER_COOKIE_ARL = 'secret';

    const env = childEnvironment();

    expect(env.DEEZER_COOKIE_ARL).toBeUndefined();
    expect(env.PATH).toBe(process.env.PATH);
    expect(process.env.DEEZER_COOKIE_ARL).toBe('secret');
  });

  it('reads stderr only from errors that carry it', () => {
    expect(childStderr(Object.assign(new Error('failed'), { stderr: 'details' }))).toBe('details');
    expect(childStderr(Object.assign(new Error('failed'), { stderr: '' }))).toBe('');
    expect(childStderr(new Error('failed'))).toBeUndefined();
    expect(childStderr('failed')).toBeUndefined();
    expect(childStderr(null)).toBeUndefined();
  });

  it('recognizes a killed child', () => {
    expect(wasKilled(Object.assign(new Error('timeout'), { killed: true }))).toBe(true);
    expect(wasKilled(Object.assign(new Error('exit 1'), { killed: false }))).toBe(false);
    expect(wasKilled(new Error('exit 1'))).toBe(false);
    expect(wasKilled(null)).toBe(false);
  });
});

describe('cumulativeTransfer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the bytes, time and fraction between cumulative totals and restarts when the total drops', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const reports: TransferSample[] = [];
    const track = cumulativeTransfer((sample) => reports.push(sample));

    track(0, 8000);
    vi.advanceTimersByTime(100);
    track(4000, 8000);
    vi.advanceTimersByTime(50);
    track(6000, 8000);
    vi.advanceTimersByTime(1000);
    track(1000);
    vi.advanceTimersByTime(20);
    track(3000);

    expect(reports).toEqual([
      { bytes: 0, elapsedMs: 0, fraction: 0 },
      { bytes: 4000, elapsedMs: 100, fraction: 0.5 },
      { bytes: 2000, elapsedMs: 50, fraction: 0.75 },
      { bytes: 0, elapsedMs: 0, fraction: null },
      { bytes: 2000, elapsedMs: 20, fraction: null },
    ]);
  });
});

describe('toPosixPath', () => {
  it('uses forward slashes', () => {
    expect(toPosixPath(path.join('albums', 'Artist - Album', 'song.mp3'))).toBe('albums/Artist - Album/song.mp3');
    expect(toPosixPath('')).toBe('');
  });
});

describe('file helpers', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'deezer-lib-test-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('only counts regular files with content as existing', async () => {
    const full = path.join(directory, 'full.mp3');
    const empty = path.join(directory, 'empty.mp3');
    const folder = path.join(directory, 'folder');
    await writeFile(full, 'audio');
    await writeFile(empty, '');
    await mkdir(folder);

    expect(await isNonEmptyFile(full)).toBe(true);
    expect(await isNonEmptyFile(empty)).toBe(false);
    expect(await isNonEmptyFile(folder)).toBe(false);
    expect(await isNonEmptyFile(path.join(directory, 'missing.mp3'))).toBe(false);
  });

  it('creates unique temporary names next to the target', () => {
    const target = path.join(directory, 'song.mp3');

    const first = temporaryPathFor(target);
    const second = temporaryPathFor(target);

    expect(first).not.toBe(second);
    expect(path.dirname(first)).toBe(directory);
    expect(first.startsWith(`${target}.`)).toBe(true);
    expect(first.endsWith('.part')).toBe(true);
  });

  it('removes a file and tolerates a missing one', async () => {
    const file = path.join(directory, 'song.mp3.part');
    await writeFile(file, 'partial');

    await removeQuietly(file);
    await expect(removeQuietly(file)).resolves.toBeUndefined();

    expect(await isNonEmptyFile(file)).toBe(false);
  });
});
