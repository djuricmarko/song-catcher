import type { SearchResultDto, SearchType } from '@song-catcher/shared';

export type { SearchType } from '@song-catcher/shared';

export const SEARCH_TYPES = [
  'track',
  'album',
  'artist',
  'album_track',
  'artist_album',
  'artist_top',
] as const satisfies readonly SearchType[];

export type WebsiteType = 'track' | 'album' | 'playlist';

export interface DeezerSong {
  SNG_ID: string;
  SNG_TITLE: string;
  ART_NAME: string;
  ALB_TITLE: string;
  ALB_PICTURE: string;
  ALB_ID?: string;
  ALB_ART_NAME?: string;
  TRACK_NUMBER?: string;
  DISK_NUMBER?: string;
  PHYSICAL_RELEASE_DATE?: string;
  TRACK_TOKEN: string;
  MD5_ORIGIN: string;
  FALLBACK?: DeezerSong;
  [key: string]: unknown;
}

export interface DeezerPageData {
  __TYPE__?: string;
  ART_NAME?: string;
  ALB_ID?: string;
  PHYSICAL_RELEASE_DATE?: string;
  [key: string]: unknown;
}

export interface DeezerAppState {
  DATA?: DeezerPageData;
  SONGS?: {
    data?: DeezerSong[];
  };
}

export type SearchResult = SearchResultDto;

export interface PlaylistResult {
  name: string;
  songs: DeezerSong[];
}
