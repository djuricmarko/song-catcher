import { load } from 'cheerio';

import type { DeezerAppState, SearchResult, SearchType } from './types.js';
import { TYPE_ALBUM, TYPE_ALBUM_TRACK, TYPE_ARTIST, TYPE_ARTIST_ALBUM, TYPE_ARTIST_TOP, TYPE_TRACK } from './types.js';

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
 * Returns the balanced JSON object starting at `start` (which must be `{`),
 * honouring strings and escapes, or undefined if it never closes.
 */
function balancedObject(text: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (character === '\\') {
        index += 1;
      } else if (character === '"') {
        inString = false;
      }
    } else if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  return undefined;
}

/**
 * Deezer embeds the page state in an inline script, typically as
 * `window.__DZR_APP_STATE__ = {"DATA":...};` possibly followed by more code.
 * Extract just the balanced object after each `{"DATA":` and ignore
 * candidates that fail to parse.
 */
export function extractAppState(html: string): DeezerAppState | undefined {
  const $ = load(html);
  const scripts = $('script')
    .map((_index, element) => $(element).text())
    .get();

  for (const script of scripts) {
    for (let start = script.indexOf('{"DATA":'); start !== -1;) {
      const candidate = balancedObject(script, start);
      if (candidate) {
        try {
          const state = JSON.parse(candidate) as DeezerAppState;
          if (state.DATA) {
            return state;
          }
        } catch {
          // Not valid JSON; try the next occurrence.
        }
      }
      start = script.indexOf('{"DATA":', start + 1);
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

  if (searchType === TYPE_TRACK || searchType === TYPE_ARTIST_TOP || searchType === TYPE_ALBUM_TRACK) {
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
