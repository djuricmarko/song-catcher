import path from 'node:path';

import type { FileExtension } from '../deezer/formats.js';
import type { DeezerSong } from '../deezer/types.js';
import { toPosixPath } from '../lib/paths.js';

/** What a song is downloaded as part of; decides its folder and file name. */
export type SongPathType = 'track' | 'album' | 'playlist';

const UNSAFE_FILENAME_CHARACTERS = /[/\\:*?"<>|]/g;
const MAX_FILENAME_LENGTH = 180;
/**
 * Most filesystems cap a name at 255 bytes. Downloads are first written to
 * `<name>.<uuid>.part` (42 extra bytes), so keep the final name well below.
 */
export const MAX_FILENAME_BYTES = 200;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function stripControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f ? ' ' : character;
  }).join('');
}

/** Truncates without splitting a character or grapheme cluster. */
function truncate(value: string, maxLength: number, maxBytes: number): string {
  let result = '';
  let bytes = 0;
  for (const { segment } of graphemeSegmenter.segment(value)) {
    const segmentBytes = Buffer.byteLength(segment, 'utf8');
    if (result.length + segment.length > maxLength || bytes + segmentBytes > maxBytes) {
      break;
    }
    result += segment;
    bytes += segmentBytes;
  }
  return result;
}

/**
 * Makes `value` safe to use as a single path component. When `extension` is
 * given it is appended after truncation, so long names keep their extension.
 */
export function cleanFilename(value: string, extension?: string): string {
  const suffix = extension ? `.${extension}` : '';
  const cleaned = truncate(
    stripControlCharacters(value).replace(UNSAFE_FILENAME_CHARACTERS, '').replace(/\s+/g, ' ').trim(),
    MAX_FILENAME_LENGTH - suffix.length,
    MAX_FILENAME_BYTES - Buffer.byteLength(suffix, 'utf8'),
  ).trim();
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') {
    return `unknown${suffix}`;
  }
  return `${cleaned}${suffix}`;
}

/** `Artist - Title.ext`, or `NN - Artist Title.ext` inside an album so files sort in track order. */
export function buildSongFilename(song: DeezerSong, searchType: SongPathType, extension: FileExtension): string {
  const artist = song.ART_NAME || 'unknown artist';
  const title = song.SNG_TITLE || 'unknown title';

  if (searchType === 'album') {
    const trackNumber = Number.parseInt(song.TRACK_NUMBER ?? '', 10);
    const prefix = Number.isFinite(trackNumber) ? `${String(trackNumber).padStart(2, '0')} - ` : '';
    return cleanFilename(`${prefix}${artist} ${title}`, extension);
  }

  return cleanFilename(`${artist} - ${title}`, extension);
}

export function buildAlbumDirectory(song: DeezerSong): string {
  const albumArtist = song.ALB_ART_NAME || song.ART_NAME || 'unknown artist';
  const album = song.ALB_TITLE || 'unknown album';
  return cleanFilename(`${albumArtist} - ${album}`);
}

export function buildPlaylistDirectory(playlistName: string): string {
  return cleanFilename(playlistName);
}

/** The directory a song belongs in: the songs folder, its album's folder or its playlist's folder. */
export function songDirectory(
  baseDirectories: {
    songsDir: string;
    albumsDir: string;
    playlistsDir: string;
  },
  searchType: SongPathType,
  song: DeezerSong,
  playlistName?: string,
): string {
  if (searchType === 'track') {
    return baseDirectories.songsDir;
  }
  if (searchType === 'album') {
    return path.join(baseDirectories.albumsDir, buildAlbumDirectory(song));
  }
  if (!playlistName) {
    throw new Error('A playlist name is required when downloading a playlist song');
  }
  return path.join(baseDirectories.playlistsDir, buildPlaylistDirectory(playlistName));
}

/** MPD addresses songs relative to its music directory, always with forward slashes. */
export function mpdRelativePath(musicDirRoot: string, absolutePath: string): string {
  const relative = path.relative(musicDirRoot, absolutePath);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${absolutePath} is not inside DEEZER_MPD_MUSIC_DIR_ROOT`);
  }
  return toPosixPath(relative);
}
