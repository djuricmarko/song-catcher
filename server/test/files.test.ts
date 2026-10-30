import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FileAccessError, listFiles } from '../src/http/files.js';

const tempDirectories: string[] = [];

async function makeBase(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'deezer-files-test-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('listFiles', () => {
  it('lists directories first and includes a parent entry', async () => {
    const base = await makeBase();
    await mkdir(path.join(base, 'album'));
    await writeFile(path.join(base, 'song.mp3'), 'abc');

    const root = await listFiles(base, '');
    expect(root.path).toBe('');
    expect(root.entries.map((entry) => entry.name)).toEqual(['album', 'song.mp3']);
    expect(root.entries[0]?.isDirectory).toBe(true);
    expect(root.entries[1]?.size).toBe(3);

    const album = await listFiles(base, 'album');
    expect(album.path).toBe('album');
    expect(album.entries[0]).toMatchObject({ name: '..', path: '', isDirectory: true });
  });

  it('rejects traversal outside the base directory', async () => {
    const base = await makeBase();
    await expect(listFiles(base, '../')).rejects.toBeInstanceOf(FileAccessError);
    await expect(listFiles(base, '../../etc')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns 404 for missing paths and 400 for files', async () => {
    const base = await makeBase();
    await writeFile(path.join(base, 'song.mp3'), 'abc');

    await expect(listFiles(base, 'missing')).rejects.toMatchObject({ statusCode: 404 });
    await expect(listFiles(base, 'song.mp3')).rejects.toMatchObject({ statusCode: 400 });
  });
});
