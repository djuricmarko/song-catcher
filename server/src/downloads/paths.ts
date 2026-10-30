import path from 'node:path';

import type { DeezerSong } from '../deezer/types.js';
import { TYPE_ALBUM, TYPE_TRACK } from '../deezer/types.js';

export type SongPathType = typeof TYPE_TRACK | typeof TYPE_ALBUM | 'playlist';

const UNSAFE_FILENAME_CHARACTERS = /[/\\:*?"<>|]/g;
const MAX_FILENAME_LENGTH = 180;

function stripControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f ? ' ' : character;
  }).join('');
}

export function cleanFilename(value: string): string {
  const cleaned = stripControlCharacters(value)
    .replace(UNSAFE_FILENAME_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH)
    .trim();
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') {
    return 'unknown';
  }
  return cleaned;
}

export function buildSongFilename(
  song: DeezerSong,
  searchType: SongPathType,
  extension: 'mp3' | 'flac',
): string {
  const artist = song.ART_NAME || 'unknown artist';
  const title = song.SNG_TITLE || 'unknown title';

  if (searchType === TYPE_ALBUM) {
    const trackNumber = Number.parseInt(song.TRACK_NUMBER ?? '', 10);
    const prefix = Number.isFinite(trackNumber) ? `${String(trackNumber).padStart(2, '0')} - ` : '';
    return cleanFilename(`${prefix}${artist} ${title}.${extension}`);
  }

  return cleanFilename(`${artist} - ${title}.${extension}`);
}

export function buildAlbumDirectory(song: DeezerSong): string {
  const albumArtist = song.ALB_ART_NAME || song.ART_NAME || 'unknown artist';
  const album = song.ALB_TITLE || 'unknown album';
  return cleanFilename(`${albumArtist} - ${album}`);
}

export function buildPlaylistDirectory(playlistName: string): string {
  return cleanFilename(playlistName);
}

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
  if (searchType === TYPE_TRACK) {
    return baseDirectories.songsDir;
  }
  if (searchType === TYPE_ALBUM) {
    return path.join(baseDirectories.albumsDir, buildAlbumDirectory(song));
  }
  if (!playlistName) {
    throw new Error('A playlist name is required when downloading a playlist song');
  }
  return path.join(baseDirectories.playlistsDir, buildPlaylistDirectory(playlistName));
}

export function mpdRelativePath(musicDirRoot: string, absolutePath: string): string {
  const relative = path.relative(musicDirRoot, absolutePath);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${absolutePath} is not inside DEEZER_MPD_MUSIC_DIR_ROOT`);
  }
  return relative.split(path.sep).join('/');
}
