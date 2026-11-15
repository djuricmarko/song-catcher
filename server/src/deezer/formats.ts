import type { Quality } from '../config/env.js';

export const SOUND_FORMATS = ['FLAC', 'MP3_320', 'MP3_128'] as const;

export type SoundFormat = (typeof SOUND_FORMATS)[number];

export type FileExtension = 'flac' | 'mp3';

export interface AccountQuality {
  lossless: boolean;
  high: boolean;
}

export function extensionForFormat(format: SoundFormat): FileExtension {
  return format === 'FLAC' ? 'flac' : 'mp3';
}

export function isSoundFormat(value: unknown): value is SoundFormat {
  return SOUND_FORMATS.some((format) => format === value);
}

export function preferredSoundFormats(quality: Quality, account: AccountQuality): SoundFormat[] {
  if (quality === 'flac' && account.lossless) {
    return ['FLAC', 'MP3_320', 'MP3_128'];
  }
  if (account.lossless || account.high) {
    return ['MP3_320', 'MP3_128'];
  }
  return ['MP3_128'];
}
