import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import NodeID3 from 'node-id3';

import { childEnvironment, childStderr } from '../lib/child-process.js';
import type { DeezerSong } from './types.js';

const execFileAsync = promisify(execFile);

const METAFLAC_MAX_BUFFER = 1024 * 1024;
/** ID3 picture type 3, the front cover. */
const ID3_FRONT_COVER = { id: 3, name: 'front cover' };

export interface MetadataOptions {
  isFlac: boolean;
  /** Front cover; omitted when it could not be downloaded. */
  picture?: Buffer;
  metaflacPath: string;
}

export class MetadataError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MetadataError';
  }
}

/** The tags written to every file, in the vocabulary shared by ID3 and Vorbis comments. */
interface SongTags {
  artist: string | undefined;
  title: string | undefined;
  album: string | undefined;
  trackNumber: string | undefined;
  discNumber: string | undefined;
  albumArtist: string | undefined;
  year: string | undefined;
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

function songTags(song: DeezerSong): SongTags {
  return {
    artist: nonEmpty(song.ART_NAME),
    title: nonEmpty(song.SNG_TITLE),
    album: nonEmpty(song.ALB_TITLE),
    trackNumber: nonEmpty(song.TRACK_NUMBER),
    discNumber: nonEmpty(song.DISK_NUMBER),
    albumArtist: nonEmpty(song.ALB_ART_NAME || song.ART_NAME),
    year: releaseYear(song),
  };
}

/** Writes title, artist, album, numbering, year and cover into a downloaded song. */
export async function writeSongMetadata(outputFile: string, song: DeezerSong, options: MetadataOptions): Promise<void> {
  const tags = songTags(song);
  if (options.isFlac) {
    await writeFlacMetadata(outputFile, tags, options);
    return;
  }
  await writeMp3Metadata(outputFile, tags, options);
}

async function writeMp3Metadata(outputFile: string, songTags: SongTags, options: MetadataOptions): Promise<void> {
  const tags: NodeID3.Tags = {
    artist: songTags.artist,
    title: songTags.title,
    album: songTags.album,
    trackNumber: songTags.trackNumber,
    partOfSet: songTags.discNumber,
    performerInfo: songTags.albumArtist,
    year: songTags.year,
    ...(options.picture
      ? {
          image: {
            mime: 'image/jpeg',
            type: ID3_FRONT_COVER,
            description: 'Cover',
            imageBuffer: options.picture,
          },
        }
      : {}),
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

async function writeFlacMetadata(outputFile: string, songTags: SongTags, options: MetadataOptions): Promise<void> {
  // metaflac can only import a cover from a file.
  const temporaryDirectory = options.picture ? await mkdtemp(path.join(tmpdir(), 'deezer-cover-')) : undefined;

  try {
    const vorbisComments: Array<[string, string | undefined]> = [
      ['ARTIST', songTags.artist],
      ['TITLE', songTags.title],
      ['ALBUM', songTags.album],
      ['TRACKNUMBER', songTags.trackNumber],
      ['DISCNUMBER', songTags.discNumber],
      ['ALBUMARTIST', songTags.albumArtist],
      ['DATE', songTags.year],
    ];

    const args = ['--remove-all-tags'];
    for (const [key, value] of vorbisComments) {
      if (value) {
        args.push(`--set-tag=${key}=${value}`);
      }
    }
    if (temporaryDirectory && options.picture) {
      const coverPath = path.join(temporaryDirectory, 'cover.jpg');
      await writeFile(coverPath, options.picture);
      args.push(`--import-picture-from=${coverPath}`);
    }
    args.push(outputFile);

    try {
      await execFileAsync(options.metaflacPath, args, {
        maxBuffer: METAFLAC_MAX_BUFFER,
        env: childEnvironment(),
      });
    } catch (error) {
      throw new MetadataError(
        `Could not write FLAC metadata with ${options.metaflacPath}: ${childStderr(error) || String(error)}`,
        { cause: error },
      );
    }
  } finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
