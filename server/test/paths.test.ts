import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { DeezerSong } from '../src/deezer/types.js';
import {
  buildAlbumDirectory,
  buildPlaylistDirectory,
  buildSongFilename,
  cleanFilename,
  mpdRelativePath,
  songDirectory,
} from '../src/downloads/paths.js';

const song: DeezerSong = {
  SNG_ID: '1',
  SNG_TITLE: 'Song / Title?',
  ART_NAME: 'Artist: Name',
  ALB_TITLE: 'Album "Name"',
  ALB_PICTURE: 'cover',
  TRACK_NUMBER: '3',
  DISK_NUMBER: '1',
  ALB_ART_NAME: 'Album Artist',
  TRACK_TOKEN: 'token',
  MD5_ORIGIN: 'origin',
};

describe('cleanFilename', () => {
  it('removes path separators and other unsafe characters', () => {
    expect(cleanFilename('a/b\\c:d"e?f*g<h>i|j')).toBe('abcdefghij');
  });

  it('replaces control characters with spaces and trims', () => {
    expect(cleanFilename('  a\tb\nc  ')).toBe('a b c');
  });

  it('caps very long names', () => {
    expect(cleanFilename('a'.repeat(500))).toHaveLength(180);
  });

  it('falls back when everything was removed', () => {
    expect(cleanFilename('///')).toBe('unknown');
    expect(cleanFilename('.')).toBe('unknown');
    expect(cleanFilename('..')).toBe('unknown');
  });
});

describe('buildSongFilename', () => {
  it('includes a zero-padded track number for albums', () => {
    expect(buildSongFilename(song, 'album', 'mp3')).toBe('03 - Artist Name Song Title.mp3');
  });

  it('omits the track number for tracks and playlists', () => {
    expect(buildSongFilename(song, 'track', 'flac')).toBe('Artist Name - Song Title.flac');
    expect(buildSongFilename(song, 'playlist', 'mp3')).toBe('Artist Name - Song Title.mp3');
  });

  it('handles a missing track number', () => {
    expect(buildSongFilename({ ...song, TRACK_NUMBER: undefined }, 'album', 'mp3')).toBe(
      'Artist Name Song Title.mp3',
    );
  });
});

describe('directories', () => {
  it('builds album and playlist directory names', () => {
    expect(buildAlbumDirectory(song)).toBe('Album Artist - Album Name');
    expect(buildPlaylistDirectory('My / Playlist')).toBe('My Playlist');
  });

  it('selects the correct base directory', () => {
    const base = {
      songsDir: '/downloads/songs',
      albumsDir: '/downloads/albums',
      playlistsDir: '/downloads/playlists',
    };
    expect(songDirectory(base, 'track', song)).toBe('/downloads/songs');
    expect(songDirectory(base, 'album', song)).toBe(
      path.join('/downloads/albums', 'Album Artist - Album Name'),
    );
    expect(songDirectory(base, 'playlist', song, 'Favorites')).toBe(
      '/downloads/playlists/Favorites',
    );
    expect(() => songDirectory(base, 'playlist', song)).toThrowError(/playlist name/);
  });
});

describe('mpdRelativePath', () => {
  it('returns a POSIX path relative to the music root', () => {
    expect(mpdRelativePath('/music', '/music/deezer/songs/a.mp3')).toBe('deezer/songs/a.mp3');
  });

  it('rejects paths outside the music root', () => {
    expect(() => mpdRelativePath('/music', '/other/a.mp3')).toThrowError(/not inside/);
    expect(() => mpdRelativePath('/music', '/music')).toThrowError(/not inside/);
  });
});
