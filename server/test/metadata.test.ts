import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import NodeID3 from 'node-id3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DeezerSong } from '../src/deezer/types.js';
import { writeSongMetadata } from '../src/deezer/metadata.js';

const execFileAsync = promisify(execFile);

const song: DeezerSong = {
  SNG_ID: '1',
  SNG_TITLE: 'Test Song',
  ART_NAME: 'Test Artist',
  ALB_TITLE: 'Test Album',
  ALB_PICTURE: 'cover',
  ALB_ART_NAME: 'Test Album Artist',
  TRACK_NUMBER: '3',
  DISK_NUMBER: '1',
  PHYSICAL_RELEASE_DATE: '2024-05-01',
  TRACK_TOKEN: 'token',
  MD5_ORIGIN: 'origin',
};

let directory: string;
let picture: Buffer;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'deezer-metadata-test-'));
  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=16x16:d=1',
    '-frames:v',
    '1',
    '-y',
    path.join(directory, 'cover.jpg'),
  ]);
  picture = await readFile(path.join(directory, 'cover.jpg'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function makeAudio(filename: string, codec: 'libmp3lame' | 'flac'): Promise<string> {
  const output = path.join(directory, filename);
  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=0.1',
    '-codec:a',
    codec,
    '-y',
    output,
  ]);
  return output;
}

describe('writeSongMetadata', () => {
  it('writes ID3 tags and an embedded cover to MP3 files', async () => {
    const output = await makeAudio('song.mp3', 'libmp3lame');

    await writeSongMetadata(output, song, {
      isFlac: false,
      picture,
      metaflacPath: 'metaflac',
    });

    const tags = await NodeID3.Promise.read(output);
    expect(tags.title).toBe('Test Song');
    expect(tags.artist).toBe('Test Artist');
    expect(tags.album).toBe('Test Album');
    expect(tags.performerInfo).toBe('Test Album Artist');
    expect(tags.trackNumber).toBe('3');
    expect(tags.partOfSet).toBe('1');
    expect(tags.year).toBe('2024');
    expect(tags.image).toBeTruthy();
  });

  it('writes Vorbis comments and an embedded cover to FLAC files', async () => {
    const output = await makeAudio('song.flac', 'flac');

    await writeSongMetadata(output, song, {
      isFlac: true,
      picture,
      metaflacPath: 'metaflac',
    });

    const { stdout } = await execFileAsync('metaflac', [
      '--list',
      '--block-type=VORBIS_COMMENT',
      output,
    ]);
    expect(stdout).toContain('TITLE=Test Song');
    expect(stdout).toContain('ARTIST=Test Artist');
    expect(stdout).toContain('ALBUM=Test Album');
    expect(stdout).toContain('ALBUMARTIST=Test Album Artist');
    expect(stdout).toContain('TRACKNUMBER=3');
    expect(stdout).toContain('DISCNUMBER=1');
    expect(stdout).toContain('DATE=2024');

    const pictures = await execFileAsync('metaflac', ['--list', '--block-type=PICTURE', output]);
    expect(pictures.stdout).toContain('type: 3 (Cover (front))');
  });
});
