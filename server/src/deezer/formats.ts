import type { Quality } from '../config/env.js';

/** Audio formats of Deezer's media API, best first. */
export const SOUND_FORMATS = ['FLAC', 'MP3_320', 'MP3_128'] as const;

export type SoundFormat = (typeof SOUND_FORMATS)[number];

export type FileExtension = 'flac' | 'mp3';

/** What the logged-in account is allowed to stream. */
export interface AccountQuality {
  lossless: boolean;
  /** 320 kbit/s MP3. */
  high: boolean;
}

export function extensionForFormat(format: SoundFormat): FileExtension {
  return format === 'FLAC' ? 'flac' : 'mp3';
}

export function isSoundFormat(value: unknown): value is SoundFormat {
  return SOUND_FORMATS.some((format) => format === value);
}

/**
 * The formats to request for a song, best first. Deezer answers with the best
 * one that exists for that particular track, so lower formats act as fallbacks.
 */
export function preferredSoundFormats(quality: Quality, account: AccountQuality): SoundFormat[] {
  if (quality === 'flac' && account.lossless) {
    return ['FLAC', 'MP3_320', 'MP3_128'];
  }
  if (account.lossless || account.high) {
    return ['MP3_320', 'MP3_128'];
  }
  return ['MP3_128'];
}
