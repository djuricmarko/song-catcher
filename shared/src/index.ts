/** Non-secret configuration exposed to the frontend. */
export interface ApiConfigResponse {
  version: string;
  useMpd: boolean;
  urlPrefix: string;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  uptimeSeconds: number;
}

export interface ApiErrorResponse {
  error: string;
  details?: string[];
}

// --- Request bodies ----------------------------------------------------------
// Field names are snake_case because the HTTP API predates this codebase and
// stays compatible with its 2.x clients.

export interface SearchRequest {
  type: SearchType;
  /** Free text, or an album/artist id for the `album_track` and `artist_*` types. */
  query: string;
}

/** `POST /api/download` */
export interface DownloadRequest {
  type: 'track' | 'album';
  music_id: number;
  add_to_playlist: boolean;
  /** Only applies to albums. */
  create_zip: boolean;
}

/** `POST /api/youtubedl` */
export interface YoutubeDownloadRequest {
  url: string;
  add_to_playlist: boolean;
}

/** `POST /api/playlist/youtube` */
export interface YoutubePlaylistDownloadRequest {
  url: string;
  add_to_playlist: boolean;
  create_zip: boolean;
}

/** `POST /api/playlist/deezer` */
export interface DeezerPlaylistDownloadRequest {
  /** A playlist URL, short link or numeric id. */
  playlist_url: string;
  add_to_playlist: boolean;
  create_zip: boolean;
}

/** `POST /api/favorites/deezer` */
export interface FavoritesDownloadRequest {
  user_id: string;
  add_to_playlist: boolean;
  create_zip: boolean;
}

// --- Responses ---------------------------------------------------------------

export type TaskState = 'waiting' | 'active' | 'mission accomplished' | 'failed';

export interface QueueTask {
  id: number;
  description: string;
  args: Record<string, unknown>;
  state: TaskState;
  result: string[] | null;
  exception: string | null;
  /** Non-fatal problems, e.g. songs of an album that could not be downloaded. */
  warnings: string[];
  progress: [number, number];
  workerIndex: number | null;
  tsQueued: number;
  tsStarted: number;
  tsFinished: number;
}

export interface TaskAcceptedResponse {
  task_id: number;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

export interface FilesResponse {
  path: string;
  entries: FileEntry[];
}

export interface DebugResponse {
  debug_msg: string;
}

/**
 * What `POST /api/search` can look up. The first three search by text; the
 * rest take the id of an album or artist and list what belongs to it.
 */
export type SearchType = 'track' | 'album' | 'artist' | 'album_track' | 'artist_album' | 'artist_top';

/** The kind of item a search result describes. */
export type SearchResultKind = 'track' | 'album' | 'artist';

export interface SearchResultDto {
  id: string;
  id_type: SearchResultKind;
  title: string;
  img_url: string;
  album: string;
  album_id: string | number;
  artist: string;
  artist_id?: string | number;
  preview_url: string;
}
