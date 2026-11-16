import type {
  ApiConfigResponse,
  ApiErrorResponse,
  DebugResponse,
  DeezerPlaylistDownloadRequest,
  DownloadRequest,
  FilesResponse,
  QueueTask,
  SearchRequest,
  SearchResultDto,
  SearchType,
  TaskAcceptedResponse,
  YoutubeDownloadRequest,
  YoutubePlaylistDownloadRequest,
} from '@song-catcher/shared';

import { encodePath } from '../lib/paths';

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

async function failureMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Partial<ApiErrorResponse>;
    if (body.error) {
      return body.details?.length ? `${body.error}: ${body.details.join(', ')}` : body.error;
    }
  } catch {}
  return `${response.status} ${response.statusText}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(await failureMessage(response));
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

export function searchMusic(type: SearchType, query: string): Promise<SearchResultDto[]> {
  const body: SearchRequest = { type, query };
  return post<SearchResultDto[]>('/search', body);
}

export function startDownload(payload: DownloadRequest): Promise<TaskAcceptedResponse> {
  return post<TaskAcceptedResponse>('/download', payload);
}

export function startYoutubeDownload(url: string, addToPlaylist: boolean): Promise<TaskAcceptedResponse> {
  const body: YoutubeDownloadRequest = { url, add_to_playlist: addToPlaylist };
  return post<TaskAcceptedResponse>('/youtubedl', body);
}

export function startYoutubePlaylistDownload(url: string, addToPlaylist: boolean): Promise<TaskAcceptedResponse> {
  const body: YoutubePlaylistDownloadRequest = { url, add_to_playlist: addToPlaylist };
  return post<TaskAcceptedResponse>('/playlist/youtube', body);
}

export function startPlaylistDownload(playlistUrl: string, addToPlaylist: boolean): Promise<TaskAcceptedResponse> {
  const body: DeezerPlaylistDownloadRequest = { playlist_url: playlistUrl, add_to_playlist: addToPlaylist };
  return post<TaskAcceptedResponse>('/playlist/deezer', body);
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
  return `${APP_ROOT}/downloads/${encodePath(filePath)}`;
}
