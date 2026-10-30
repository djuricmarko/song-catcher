import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import NodeID3 from 'node-id3';

import type { DeezerSong } from './types.js';

const execFileAsync = promisify(execFile);

function childEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.DEEZER_COOKIE_ARL;
  return env;
}

export interface MetadataOptions {
  isFlac: boolean;
  picture: Buffer;
  metaflacPath: string;
}

export class MetadataError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MetadataError';
  }
}

function releaseYear(song: DeezerSong): string | undefined {
  const date = song.PHYSICAL_RELEASE_DATE;
  if (typeof date !== 'string' || date.length < 4) {
    return undefined;
  }
  return date.slice(0, 4);
}

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

export async function writeSongMetadata(
  outputFile: string,
  song: DeezerSong,
  options: MetadataOptions,
): Promise<void> {
  if (options.isFlac) {
    await writeFlacMetadata(outputFile, song, options);
    return;
  }
  await writeMp3Metadata(outputFile, song, options);
}

async function writeMp3Metadata(
  outputFile: string,
  song: DeezerSong,
  options: MetadataOptions,
): Promise<void> {
  const tags: NodeID3.Tags = {
    artist: nonEmpty(song.ART_NAME),
    title: nonEmpty(song.SNG_TITLE),
    album: nonEmpty(song.ALB_TITLE),
    trackNumber: nonEmpty(song.TRACK_NUMBER),
    partOfSet: nonEmpty(song.DISK_NUMBER),
    performerInfo: nonEmpty(song.ALB_ART_NAME || song.ART_NAME),
    year: releaseYear(song),
    image: {
      mime: 'image/jpeg',
      type: { id: 3, name: 'front cover' },
      description: 'Cover',
      imageBuffer: options.picture,
    },
  };

  try {
    const result = await NodeID3.Promise.write(tags, outputFile);
    if (result === false) {
      throw new MetadataError(`node-id3 refused to write tags to ${outputFile}`);
    }
  } catch (error) {
    if (error instanceof MetadataError) {
      throw error;
    }
    throw new MetadataError(`Could not write MP3 metadata: ${String(error)}`, {
      cause: error,
    });
  }
}

async function writeFlacMetadata(
  outputFile: string,
  song: DeezerSong,
  options: MetadataOptions,
): Promise<void> {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'deezer-cover-'));
  const coverPath = path.join(temporaryDirectory, 'cover.jpg');

  try {
    await writeFile(coverPath, options.picture);

    const tags: Array<[string, string | undefined]> = [
      ['ARTIST', nonEmpty(song.ART_NAME)],
      ['TITLE', nonEmpty(song.SNG_TITLE)],
      ['ALBUM', nonEmpty(song.ALB_TITLE)],
      ['TRACKNUMBER', nonEmpty(song.TRACK_NUMBER)],
      ['DISCNUMBER', nonEmpty(song.DISK_NUMBER)],
      ['ALBUMARTIST', nonEmpty(song.ALB_ART_NAME || song.ART_NAME)],
      ['DATE', releaseYear(song)],
    ];

    const args = ['--remove-all-tags'];
    for (const [key, value] of tags) {
      if (value) {
        args.push(`--set-tag=${key}=${value}`);
      }
    }
    args.push(`--import-picture-from=${coverPath}`, outputFile);

    try {
      await execFileAsync(options.metaflacPath, args, {
        maxBuffer: 1024 * 1024,
        env: childEnvironment(),
      });
    } catch (error) {
      const stderr =
        typeof error === 'object' && error !== null && 'stderr' in error
          ? String(error.stderr)
          : '';
      throw new MetadataError(
        `Could not write FLAC metadata with ${options.metaflacPath}: ${stderr || String(error)}`,
        { cause: error },
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
