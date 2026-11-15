/**
 * Shapes of the Deezer responses the client reads. Deezer documents none of
 * this, so every field is optional and checked before use.
 */
import type { DeezerSong } from './types.js';

export interface DeezerApiError {
  message?: string;
  type?: string;
  code?: number;
}

/** `deezer.getUserData` on the private gw-light API. */
export interface UserDataResponse {
  results?: {
    /** CSRF token for other gw-light calls. */
    checkForm?: string;
    USER?: {
      OPTIONS?: {
        license_token?: string;
        web_hq?: boolean;
        web_sound_quality?: {
          high?: boolean;
          lossless?: boolean;
        };
      };
    };
  };
}

/** `deezer.pagePlaylist` on the private gw-light API. */
export interface PlaylistResponse {
  error?: unknown[];
  results?: {
    DATA?: {
      TITLE?: string;
      NB_SONG?: number;
    };
    SONGS?: {
      count?: number;
      data?: DeezerSong[];
    };
  };
}

/** `/user/{id}/tracks` on the public API. */
export interface FavoritesResponse {
  data?: Array<{ id: number }>;
  total?: number;
  /** URL of the next page, absent on the last one. */
  next?: string;
  error?: DeezerApiError | string;
}

/** `/search/{type}`, `/album/{id}` and `/artist/{id}/...` on the public API. */
export interface SearchResponse {
  data?: unknown[];
  tracks?: { data?: unknown[] };
  error?: DeezerApiError | string;
}

/** `get_url` on the media API. */
export interface MediaResponse {
  data?: Array<{
    errors?: Array<{ message?: string }>;
    media?: Array<{
      format?: string;
      sources?: Array<{ url?: string }>;
    }>;
  }>;
}
