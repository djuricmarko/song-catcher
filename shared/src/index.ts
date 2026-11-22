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

export interface SearchRequest {
  type: SearchType;
  query: string;
}

export interface DownloadRequest {
  type: 'track' | 'album';
  music_id: number;
  add_to_playlist: boolean;
  title?: string;
  subtitle?: string;
}

export interface YoutubeDownloadRequest {
  url: string;
  add_to_playlist: boolean;
}

export interface YoutubePlaylistDownloadRequest {
  url: string;
  add_to_playlist: boolean;
}

export interface DeezerPlaylistDownloadRequest {
  playlist_url: string;
  add_to_playlist: boolean;
}

export type TaskState = 'waiting' | 'active' | 'mission accomplished' | 'failed';

export type TaskSource = 'deezer' | 'youtube';

export type TaskKind = 'track' | 'album' | 'playlist';

export interface TaskMedia {
  title: string;
  subtitle: string | null;
  date: string | null;
}

export interface QueueTask extends TaskMedia {
  id: number;
  source: TaskSource;
  kind: TaskKind;
  sizeBytes: number;
  speedBps: number | null;
  fileProgress: number | null;
  args: Record<string, unknown>;
  state: TaskState;
  result: string[] | null;
  exception: string | null;
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

export interface DesktopSettings {
  arl: string;
  quality: 'mp3' | 'flac';
  downloadDir: string;
  proxyUrl: string;
  workers: number;
  youtubePlaylistMax: number;
  mpdEnabled: boolean;
  mpdHost: string;
  mpdPort: number;
  mpdMusicDir: string;
  theme: 'system' | 'light' | 'dark';
}

export type DesktopTool = 'yt-dlp' | 'ffmpeg' | 'metaflac';

export interface DesktopSettingsState {
  settings: DesktopSettings;
  defaults: DesktopSettings;
  notice: string | undefined;
  tools: Record<DesktopTool, boolean>;
  secretsEncrypted: boolean;
  version: string;
}

export type SaveSettingsResult = { ok: true } | { ok: false; message: string };

export interface SettingsBridge {
  load: () => Promise<DesktopSettingsState>;
  save: (settings: DesktopSettings) => Promise<SaveSettingsResult>;
  chooseDirectory: (current: string) => Promise<string | undefined>;
  setTheme: (theme: DesktopSettings['theme']) => void;
}

export type SearchType = 'track' | 'album' | 'artist' | 'album_track' | 'artist_album' | 'artist_top';

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
