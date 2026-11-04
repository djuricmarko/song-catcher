import { load } from 'cheerio';

import type { DeezerAppState, SearchResult, SearchType } from './types.js';
import {
  TYPE_ALBUM,
  TYPE_ALBUM_TRACK,
  TYPE_ARTIST,
  TYPE_ARTIST_ALBUM,
  TYPE_ARTIST_TOP,
  TYPE_TRACK,
} from './types.js';

export interface DeezerApiError {
  message?: string;
  type?: string;
  code?: number;
}

export interface SearchResponse {
  data?: unknown[];
  tracks?: { data?: unknown[] };
  error?: DeezerApiError | string;
}

// The public API omits fields depending on the endpoint (e.g. album tracks
// may lack `album`), so treat everything as optional.
interface DeezerApiTrack {
  id?: number;
  title?: string;
  preview?: string;
  artist?: { id?: number; name?: string };
  album?: { id?: number; title?: string; cover_small?: string };
}

interface DeezerApiAlbum {
  id?: number;
  title?: string;
  cover_small?: string;
  artist?: { name?: string };
}

interface DeezerApiArtist {
  id?: number;
  name?: string;
  picture_small?: string;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function apiErrorText(error: DeezerApiError | string | undefined): string {
  if (!error) {
    return 'unknown Deezer API error';
  }
  if (typeof error === 'string') {
    return error;
  }
  return error.message ?? error.type ?? 'unknown Deezer API error';
}

/**
 * Deezer embeds the page state in an inline script. The script is not pure JSON
 * in every response, so try each script that starts with {"DATA": and ignore
 * parse failures.
 */
export function extractAppState(html: string): DeezerAppState | undefined {
  const $ = load(html);
  const scripts = $('script')
    .map((_index, element) => $(element).text())
    .get();

  for (const script of scripts) {
    const match = /\{"DATA":.*/.exec(script);
    if (!match) {
      continue;
    }
    try {
      const state = JSON.parse(match[0]) as DeezerAppState;
      if (state.DATA) {
        return state;
      }
    } catch {
      // Deezer sometimes appends non-JSON content to the script. Try the next one.
    }
  }

  return undefined;
}

export function extractPlaylistId(value: string): string | undefined {
  const match = /\/playlist\/(\d+)/.exec(value) ?? /^(\d+)$/.exec(value);
  return match?.[1];
}

/** Album context used to fill in tracks that come without an `album` object. */
export interface AlbumContext {
  id?: number;
  title?: string;
  cover_small?: string;
}

export function mapSearchResult(
  item: unknown,
  searchType: SearchType,
  albumContext?: AlbumContext,
): SearchResult | undefined {
  if (typeof item !== 'object' || item === null || !('id' in item)) {
    return undefined;
  }

  if (searchType === TYPE_ALBUM || searchType === TYPE_ARTIST_ALBUM) {
    const album = item as DeezerApiAlbum;
    return {
      id: String(album.id),
      id_type: TYPE_ALBUM,
      album: album.title ?? '',
      album_id: album.id ?? '',
      img_url: album.cover_small ?? '',
      title: '',
      preview_url: '',
      artist: album.artist?.name ?? '',
    };
  }

  if (
    searchType === TYPE_TRACK ||
    searchType === TYPE_ARTIST_TOP ||
    searchType === TYPE_ALBUM_TRACK
  ) {
    const track = item as DeezerApiTrack;
    const album = track.album ?? albumContext;
    return {
      id: String(track.id),
      id_type: TYPE_TRACK,
      title: track.title ?? '',
      img_url: album?.cover_small ?? albumContext?.cover_small ?? '',
      album: album?.title ?? albumContext?.title ?? '',
      album_id: album?.id ?? albumContext?.id ?? '',
      artist: track.artist?.name ?? '',
      preview_url: track.preview ?? '',
    };
  }

  const artist = item as DeezerApiArtist;
  return {
    id: String(artist.id),
    id_type: TYPE_ARTIST,
    title: '',
    img_url: artist.picture_small ?? '',
    album: '',
    album_id: '',
    artist: artist.name ?? '',
    artist_id: artist.id ?? '',
    preview_url: '',
  };
}
