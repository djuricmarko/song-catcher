import type { DeezerSong } from './types.js';

export interface DeezerApiError {
  message?: string;
  type?: string;
  code?: number;
}

export interface UserDataResponse {
  results?: {
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

export interface FavoritesResponse {
  data?: Array<{ id: number }>;
  total?: number;
  next?: string;
  error?: DeezerApiError | string;
}

export interface SearchResponse {
  data?: unknown[];
  tracks?: { data?: unknown[] };
  error?: DeezerApiError | string;
}

export interface MediaResponse {
  data?: Array<{
    errors?: Array<{ message?: string }>;
    media?: Array<{
      format?: string;
      sources?: Array<{ url?: string }>;
    }>;
  }>;
}
