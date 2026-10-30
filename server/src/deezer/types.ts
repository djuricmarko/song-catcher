export const TYPE_TRACK = 'track';
export const TYPE_ALBUM = 'album';
export const TYPE_PLAYLIST = 'playlist';
export const TYPE_ARTIST = 'artist';
export const TYPE_ALBUM_TRACK = 'album_track';
export const TYPE_ARTIST_ALBUM = 'artist_album';
export const TYPE_ARTIST_TOP = 'artist_top';

export type SearchType =
  | typeof TYPE_TRACK
  | typeof TYPE_ALBUM
  | typeof TYPE_ARTIST
  | typeof TYPE_ALBUM_TRACK
  | typeof TYPE_ARTIST_ALBUM
  | typeof TYPE_ARTIST_TOP;

export type WebsiteType = typeof TYPE_TRACK | typeof TYPE_ALBUM | typeof TYPE_PLAYLIST;

export type IdType = typeof TYPE_TRACK | typeof TYPE_ALBUM | typeof TYPE_ARTIST;

export type DownloadType = typeof TYPE_TRACK | typeof TYPE_ALBUM;

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

export interface SearchResult {
  id: string;
  id_type: IdType;
  title: string;
  img_url: string;
  album: string;
  album_id: string | number;
  artist: string;
  artist_id?: string | number;
  preview_url: string;
}

export interface PlaylistResult {
  name: string;
  songs: DeezerSong[];
}
