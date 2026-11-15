import { load } from 'cheerio';

import type { DeezerApiError } from './responses.js';
import type { DeezerAppState, SearchResult, SearchType } from './types.js';

const UNKNOWN_API_ERROR = 'unknown Deezer API error';
const APP_STATE_START = '{"DATA":';

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

export function apiErrorText(error: DeezerApiError | string | undefined): string {
  if (!error) {
    return UNKNOWN_API_ERROR;
  }
  if (typeof error === 'string') {
    return error;
  }
  return error.message ?? error.type ?? UNKNOWN_API_ERROR;
}

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

export function extractAppState(html: string): DeezerAppState | undefined {
  const $ = load(html);
  const scripts = $('script')
    .map((_index, element) => $(element).text())
    .get();

  for (const script of scripts) {
    let start = script.indexOf(APP_STATE_START);
    while (start !== -1) {
      const state = parseAppState(balancedObject(script, start));
      if (state) {
        return state;
      }
      start = script.indexOf(APP_STATE_START, start + 1);
    }
  }

  return undefined;
}

function parseAppState(candidate: string | undefined): DeezerAppState | undefined {
  if (!candidate) {
    return undefined;
  }
  try {
    const state = JSON.parse(candidate) as DeezerAppState;
    return state.DATA ? state : undefined;
  } catch {
    return undefined;
  }
}

export function extractPlaylistId(value: string): string | undefined {
  const match = /\/playlist\/(\d+)/.exec(value) ?? /^(\d+)$/.exec(value);
  return match?.[1];
}

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

  if (searchType === 'album' || searchType === 'artist_album') {
    const album = item as DeezerApiAlbum;
    return {
      id: String(album.id),
      id_type: 'album',
      album: album.title ?? '',
      album_id: album.id ?? '',
      img_url: album.cover_small ?? '',
      title: '',
      preview_url: '',
      artist: album.artist?.name ?? '',
    };
  }

  if (searchType === 'track' || searchType === 'artist_top' || searchType === 'album_track') {
    const track = item as DeezerApiTrack;
    const album = track.album ?? albumContext;
    return {
      id: String(track.id),
      id_type: 'track',
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
    id_type: 'artist',
    title: '',
    img_url: artist.picture_small ?? '',
    album: '',
    album_id: '',
    artist: artist.name ?? '',
    artist_id: artist.id ?? '',
    preview_url: '',
  };
}
