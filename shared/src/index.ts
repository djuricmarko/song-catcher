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

export type TaskState = 'waiting' | 'active' | 'mission accomplished' | 'failed';

export interface QueueTask {
  id: number;
  description: string;
  args: Record<string, unknown>;
  state: TaskState;
  result: string[] | null;
  exception: string | null;
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

export interface SearchResultDto {
  id: string;
  id_type: 'track' | 'album' | 'artist';
  title: string;
  img_url: string;
  album: string;
  album_id: string | number;
  artist: string;
  artist_id?: string | number;
  preview_url: string;
}
