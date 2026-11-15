import { describe, expect, it } from 'vitest';

import { basename, encodePath, fileExtension } from '../../src/lib/paths';

describe('encodePath', () => {
  it('encodes each segment and keeps the slashes', () => {
    expect(encodePath('My Album/01 #1?.mp3')).toBe('My%20Album/01%20%231%3F.mp3');
    expect(encodePath('100% hits/a&b.mp3')).toBe('100%25%20hits/a%26b.mp3');
    expect(encodePath('')).toBe('');
  });
});

describe('basename', () => {
  it('returns the last segment for either kind of slash', () => {
    expect(basename('/music/albums/song.mp3')).toBe('song.mp3');
    expect(basename('C:\\music\\song.mp3')).toBe('song.mp3');
    expect(basename('song.mp3')).toBe('song.mp3');
  });

  it('keeps the input when it ends in a slash', () => {
    expect(basename('/music/albums/')).toBe('/music/albums/');
  });
});

describe('fileExtension', () => {
  it('returns the lower-cased extension', () => {
    expect(fileExtension('Song.MP3')).toBe('mp3');
    expect(fileExtension('archive.tar.zip')).toBe('zip');
  });

  it('returns the whole name when there is no dot', () => {
    expect(fileExtension('README')).toBe('readme');
    expect(fileExtension('')).toBe('');
  });
});
