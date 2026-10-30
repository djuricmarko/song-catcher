import type {
  ApiConfigResponse,
  DebugResponse,
  FilesResponse,
  HealthResponse,
  QueueTask,
  SearchResultDto,
  TaskAcceptedResponse,
} from '@deezer-downloader/shared';

interface RuntimeConfig {
  apiRoot?: string;
  appRoot?: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeConfig;
  }
}

export const API_ROOT = window.__APP_CONFIG__?.apiRoot ?? '/api';
export const APP_ROOT = window.__APP_CONFIG__?.appRoot ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string; details?: string[] };
      if (body.error) {
        message = body.details?.length ? `${body.error}: ${body.details.join(', ')}` : body.error;
      }
    } catch {
      // Keep the status-based message.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getConfig(): Promise<ApiConfigResponse> {
  return request<ApiConfigResponse>('/config');
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

export function searchMusic(type: string, query: string): Promise<SearchResultDto[]> {
  return post<SearchResultDto[]>('/search', { type, query });
}

export interface DownloadRequest {
  type: 'track' | 'album';
  music_id: number;
  add_to_playlist: boolean;
  create_zip: boolean;
}

export function startDownload(payload: DownloadRequest): Promise<TaskAcceptedResponse> {
  return post<TaskAcceptedResponse>('/download', payload);
}

export function startYoutubeDownload(
  url: string,
  addToPlaylist: boolean,
): Promise<TaskAcceptedResponse> {
  return post<TaskAcceptedResponse>('/youtubedl', {
    url,
    add_to_playlist: addToPlaylist,
  });
}

export function startPlaylistDownload(
  playlistUrl: string,
  addToPlaylist: boolean,
  createZip: boolean,
): Promise<TaskAcceptedResponse> {
  return post<TaskAcceptedResponse>('/playlist/deezer', {
    playlist_url: playlistUrl,
    add_to_playlist: addToPlaylist,
    create_zip: createZip,
  });
}

export function startFavoritesDownload(
  userId: string,
  addToPlaylist: boolean,
  createZip: boolean,
): Promise<TaskAcceptedResponse> {
  return post<TaskAcceptedResponse>('/favorites/deezer', {
    user_id: userId,
    add_to_playlist: addToPlaylist,
    create_zip: createZip,
  });
}

export function getQueue(): Promise<QueueTask[]> {
  return request<QueueTask[]>('/queue');
}

export function getFiles(path: string): Promise<FilesResponse> {
  return request<FilesResponse>(`/files?path=${encodeURIComponent(path)}`);
}

export function getDebug(): Promise<DebugResponse> {
  return request<DebugResponse>('/debug');
}

export function downloadUrl(filePath: string): string {
  const encoded = filePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${APP_ROOT}/downloads/${encoded}`;
}
