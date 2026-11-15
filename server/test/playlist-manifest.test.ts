import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  YOUTUBE_PLAYLIST_MANIFEST,
  readPlaylistManifest,
  writePlaylistManifest,
} from '../src/downloads/playlist-manifest.js';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'deezer-manifest-test-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('playlist manifest', () => {
  it('reads back what was written and leaves no temporary file behind', async () => {
    await writePlaylistManifest(directory, { abc: 'Song One.mp3', def: 'Song Two.mp3' });

    expect(await readPlaylistManifest(directory)).toEqual({ abc: 'Song One.mp3', def: 'Song Two.mp3' });
    expect(await readdir(directory)).toEqual([YOUTUBE_PLAYLIST_MANIFEST]);
  });

  it('treats a missing or unparsable manifest as empty', async () => {
    expect(await readPlaylistManifest(directory)).toEqual({});

    await writeFile(path.join(directory, YOUTUBE_PLAYLIST_MANIFEST), '{not json');
    expect(await readPlaylistManifest(directory)).toEqual({});

    await writeFile(path.join(directory, YOUTUBE_PLAYLIST_MANIFEST), '["a.mp3"]');
    expect(await readPlaylistManifest(directory)).toEqual({});
  });

  it('drops entries that are not plain file names', async () => {
    await writeFile(
      path.join(directory, YOUTUBE_PLAYLIST_MANIFEST),
      JSON.stringify({
        ok: 'Song.mp3',
        escape: '../../etc/passwd',
        nested: 'sub/Song.mp3',
        empty: '',
        number: 7,
      }),
    );

    expect(await readPlaylistManifest(directory)).toEqual({ ok: 'Song.mp3' });
  });
});
