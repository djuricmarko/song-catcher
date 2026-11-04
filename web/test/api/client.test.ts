import { describe, expect, it, vi } from 'vitest';

import * as api from '../../src/api/client';
import { jsonResponse, mockFetch } from '../utils';

function lastCall(fetchMock: ReturnType<typeof mockFetch>) {
  const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
  return { url: String(url), init: init as RequestInit };
}

describe('api client', () => {
  it('uses default roots without runtime config', () => {
    expect(api.API_ROOT).toBe('/api');
    expect(api.APP_ROOT).toBe('');
  });

  it('GETs JSON with an Accept header only', async () => {
    const fetchMock = mockFetch({ 'GET /config': { version: '3.0.0', useMpd: false, urlPrefix: '' } });
    await expect(api.getConfig()).resolves.toEqual({ version: '3.0.0', useMpd: false, urlPrefix: '' });
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('/api/config');
    expect(init.headers).toEqual({ Accept: 'application/json' });
  });

  it.each([
    ['getQueue', () => api.getQueue(), '/api/queue'],
    ['getDebug', () => api.getDebug(), '/api/debug'],
    ['getFiles', () => api.getFiles('a b/c&d'), '/api/files?path=a%20b%2Fc%26d'],
  ])('%s hits the right endpoint', async (_name, call, expected) => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    await call();
    expect(lastCall(fetchMock as never).url).toBe(expected);
  });

  it.each([
    ['searchMusic', () => api.searchMusic('track', 'abba'), '/api/search', { type: 'track', query: 'abba' }],
    [
      'startDownload',
      () => api.startDownload({ type: 'album', music_id: 5, add_to_playlist: true, create_zip: false }),
      '/api/download',
      { type: 'album', music_id: 5, add_to_playlist: true, create_zip: false },
    ],
    [
      'startYoutubeDownload',
      () => api.startYoutubeDownload('https://y', true),
      '/api/youtubedl',
      { url: 'https://y', add_to_playlist: true },
    ],
    [
      'startPlaylistDownload',
      () => api.startPlaylistDownload('123', false, true),
      '/api/playlist/deezer',
      { playlist_url: '123', add_to_playlist: false, create_zip: true },
    ],
    [
      'startFavoritesDownload',
      () => api.startFavoritesDownload('42', true, true),
      '/api/favorites/deezer',
      { user_id: '42', add_to_playlist: true, create_zip: true },
    ],
  ])('%s POSTs a JSON body', async (_name, call, expectedUrl, expectedBody) => {
    const fetchMock = vi.fn(async () => jsonResponse({ task_id: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    await call();
    const { url, init } = lastCall(fetchMock as never);
    expect(url).toBe(expectedUrl);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual(expectedBody);
  });

  it('uses the API error message', async () => {
    mockFetch({ 'GET /debug': () => jsonResponse({ error: 'Broken' }, { status: 500 }) });
    await expect(api.getDebug()).rejects.toThrow(/^Broken$/);
  });

  it('appends error details', async () => {
    mockFetch({
      'POST /search': () => jsonResponse({ error: 'Invalid', details: ['a', 'b'] }, { status: 400 }),
    });
    await expect(api.searchMusic('x', 'y')).rejects.toThrow(/^Invalid: a, b$/);
  });

  it('falls back to the status line when the body has no error', async () => {
    mockFetch({ 'GET /queue': () => jsonResponse({}, { status: 503, statusText: 'Unavailable' }) });
    await expect(api.getQueue()).rejects.toThrow(/^503 Unavailable$/);
  });

  it('falls back to the status line when the body is not JSON', async () => {
    mockFetch({ 'GET /queue': () => new Response('<html>', { status: 502, statusText: 'Bad Gateway' }) });
    await expect(api.getQueue()).rejects.toThrow(/^502 Bad Gateway$/);
  });

  it('encodes each path segment of download URLs', () => {
    expect(api.downloadUrl('My Album/01 #1?.mp3')).toBe('/downloads/My%20Album/01%20%231%3F.mp3');
  });
});

describe('api client runtime config', () => {
  it('reads roots from window.__APP_CONFIG__', async () => {
    vi.resetModules();
    window.__APP_CONFIG__ = { apiRoot: '/prefix/api', appRoot: '/prefix' };
    try {
      const fresh = await import('../../src/api/client');
      expect(fresh.API_ROOT).toBe('/prefix/api');
      expect(fresh.downloadUrl('a.mp3')).toBe('/prefix/downloads/a.mp3');
    } finally {
      delete window.__APP_CONFIG__;
      vi.resetModules();
    }
  });
});
