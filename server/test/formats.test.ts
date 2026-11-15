import { describe, expect, it } from 'vitest';

import { extensionForFormat, isSoundFormat, preferredSoundFormats } from '../src/deezer/formats.js';

describe('preferredSoundFormats', () => {
  it('asks for FLAC first only when it is configured and the account is lossless', () => {
    expect(preferredSoundFormats('flac', { lossless: true, high: true })).toEqual(['FLAC', 'MP3_320', 'MP3_128']);
    expect(preferredSoundFormats('mp3', { lossless: true, high: true })).toEqual(['MP3_320', 'MP3_128']);
  });

  it('falls back to MP3 when FLAC is configured but the account is not lossless', () => {
    expect(preferredSoundFormats('flac', { lossless: false, high: true })).toEqual(['MP3_320', 'MP3_128']);
    expect(preferredSoundFormats('flac', { lossless: false, high: false })).toEqual(['MP3_128']);
  });

  it('treats a lossless account as high quality even without the high flag', () => {
    expect(preferredSoundFormats('mp3', { lossless: true, high: false })).toEqual(['MP3_320', 'MP3_128']);
  });

  it('uses MP3_128 for free accounts', () => {
    expect(preferredSoundFormats('mp3', { lossless: false, high: false })).toEqual(['MP3_128']);
  });
});

describe('sound format helpers', () => {
  it('maps formats to file extensions', () => {
    expect(extensionForFormat('FLAC')).toBe('flac');
    expect(extensionForFormat('MP3_320')).toBe('mp3');
    expect(extensionForFormat('MP3_128')).toBe('mp3');
  });

  it('recognizes only the formats Deezer is asked for', () => {
    expect(isSoundFormat('FLAC')).toBe(true);
    expect(isSoundFormat('MP3_128')).toBe(true);
    expect(isSoundFormat('MP3_64')).toBe(false);
    expect(isSoundFormat(undefined)).toBe(false);
  });
});
