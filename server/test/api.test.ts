import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DeezerClient } from '../src/deezer/client.js';
import type { DeezerSong } from '../src/deezer/types.js';
import type { DownloadService } from '../src/downloads/service.js';
import { loadConfig, type AppConfig } from '../src/config/env.js';
import { createServer } from '../src/http/server.js';
import { Scheduler } from '../src/queue/scheduler.js';

const ARL = 'a'.repeat(192);
const logger = pino({ level: 'silent' });
const hasWebBuild = existsSync(new URL('../../web/dist/index.html', import.meta.url));

const song: DeezerSong = {
  SNG_ID: '123',
  SNG_TITLE: 'Song',
  ART_NAME: 'Artist',
  ALB_TITLE: 'Album',
  ALB_PICTURE: 'cover',
  TRACK_TOKEN: 'token',
  MD5_ORIGIN: 'origin',
};

let baseDirectory: string;
let config: AppConfig;
let app: Awaited<ReturnType<typeof createServer>>;
let scheduler: Scheduler;

function createFakeDeezer(): DeezerClient {
  return {
    deezerSearch: async (query: string, type: string) => [
      {
        id: '1',
        id_type: 'track',
        title: query,
        img_url: 'cover',
        album: 'Album',
        album_id: 1,
        artist: 'Artist',
        preview_url: 'preview',
        searchType: type,
      },
    ],
    parseDeezerPlaylist: async () => ({ name: 'Playlist', songs: [song] }),
    getDeezerFavorites: async () => ['123'],
    getSongInfosFromWebsite: async () => song,
    downloadSong: async () => undefined,
    downloadPicture: async () => Buffer.from('cover'),
    testLogin: async () => true,
    fileExtension: 'mp3',
  } as unknown as DeezerClient;
}

beforeEach(async () => {
  baseDirectory = await mkdtemp(path.join(tmpdir(), 'deezer-api-test-'));
  await mkdir(path.join(baseDirectory, 'songs'));
  await writeFile(path.join(baseDirectory, 'songs', 'song.mp3'), 'abc');

  config = loadConfig(
    {
      DEEZER_COOKIE_ARL: ARL,
      DEEZER_DOWNLOAD_DIR: baseDirectory,
    },
    { cwd: baseDirectory },
  );

  scheduler = new Scheduler(1, 10, logger);
  scheduler.register('download_deezer_song_and_queue', async () => []);
  scheduler.register('download_deezer_album_and_queue_and_zip', async () => []);
  scheduler.register('download_deezer_playlist_and_queue_and_zip', async () => []);
  scheduler.register('download_deezer_favorites', async () => []);
  scheduler.register('download_youtubedl_and_queue', async () => []);
  scheduler.start();

  app = await createServer(config, logger, {
    deezer: createFakeDeezer(),
    scheduler,
    downloads: {} as DownloadService,
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await scheduler.stop();
  await rm(baseDirectory, { recursive: true, force: true });
});

describe('health and config', () => {
  it('returns health information', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('returns non-secret config', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/config' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      version: expect.any(String),
      useMpd: false,
      urlPrefix: '',
    });
  });
});

describe('downloads static files', () => {
  it('serves files inside the download directory and blocks symlink escapes', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'deezer-api-outside-'));
    try {
      const secret = path.join(outside, 'secret.txt');
      await writeFile(secret, 'secret');
      await symlink(secret, path.join(baseDirectory, 'escape.txt'));

      const normal = await app.inject({ method: 'GET', url: '/downloads/songs/song.mp3' });
      expect(normal.statusCode).toBe(200);
      expect(normal.body).toBe('abc');

      const escape = await app.inject({ method: 'GET', url: '/downloads/escape.txt' });
      expect(escape.statusCode).toBe(404);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe('search', () => {
  it('returns search results', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: { type: 'track', query: 'moby' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).toMatchObject({ title: 'moby' });
  });

  it.each([
    [{ type: 'track', query: '' }, /query/],
    [{ type: 'ogg', query: 'moby' }, /type/],
    [{ type: 'track', query: 'moby', extra: true }, /extra/],
  ])('rejects invalid search payload %j', async (payload, message) => {
    const response = await app.inject({ method: 'POST', url: '/api/search', payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().details.join(' ')).toMatch(message);
  });
});

describe('download endpoints', () => {
  it('enqueues a track download', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/download',
      payload: {
        type: 'track',
        music_id: 123,
        add_to_playlist: false,
        create_zip: false,
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().task_id).toBeGreaterThan(0);
  });

  it('enqueues an album download', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/download',
      payload: {
        type: 'album',
        music_id: '123',
        add_to_playlist: true,
        create_zip: true,
      },
    });
    expect(response.statusCode).toBe(202);
  });

  it('rejects a missing boolean', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/download',
      payload: { type: 'track', music_id: 123, add_to_playlist: false },
    });
    expect(response.statusCode).toBe(400);
  });

  it('enqueues a yt-dlp download', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/youtubedl',
      payload: { url: 'https://www.youtube.com/watch?v=abc', add_to_playlist: false },
    });
    expect(response.statusCode).toBe(202);
  });

  it('rejects a non-http URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/youtubedl',
      payload: { url: 'ftp://example.com/file', add_to_playlist: false },
    });
    expect(response.statusCode).toBe(400);
  });

  it('enqueues a playlist download', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/playlist/deezer',
      payload: {
        playlist_url: 'https://www.deezer.com/us/playlist/1',
        add_to_playlist: false,
        create_zip: false,
      },
    });
    expect(response.statusCode).toBe(202);
  });

  it('rejects an empty playlist URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/playlist/deezer',
      payload: { playlist_url: ' ', add_to_playlist: false, create_zip: false },
    });
    expect(response.statusCode).toBe(400);
  });

  it('enqueues a favorites download', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/favorites/deezer',
      payload: { user_id: '123', add_to_playlist: false, create_zip: false },
    });
    expect(response.statusCode).toBe(202);
  });

  it('rejects a non-numeric user id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/favorites/deezer',
      payload: { user_id: 'abc', add_to_playlist: false, create_zip: false },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('queue and files', () => {
  it('returns the queue', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/queue' });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it('lists files', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/files?path=' });
    expect(response.statusCode).toBe(200);
    expect(response.json().entries[0]).toMatchObject({ name: 'songs', isDirectory: true });
  });

  it('serves downloaded files', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/downloads/songs/song.mp3',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('abc');
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'not found' });
  });
});

describe('debug', () => {
  it('explains when no debug source is configured', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/debug' });
    expect(response.statusCode).toBe(200);
    expect(response.json().debug_msg).toMatch(/No DEEZER_DEBUG_COMMAND/);
  });
});

describe('URL prefix', () => {
  it('serves the API, SPA fallback and assets under a prefix', async () => {
    const prefixedConfig = loadConfig(
      {
        DEEZER_COOKIE_ARL: ARL,
        DEEZER_DOWNLOAD_DIR: baseDirectory,
        DEEZER_URL_PREFIX: '/deezer',
      },
      { cwd: baseDirectory },
    );
    const prefixedScheduler = new Scheduler(1, 10, logger);
    prefixedScheduler.register('download_deezer_song_and_queue', async () => []);
    prefixedScheduler.start();

    const prefixedApp = await createServer(prefixedConfig, logger, {
      deezer: createFakeDeezer(),
      scheduler: prefixedScheduler,
      downloads: {} as DownloadService,
    });
    await prefixedApp.ready();

    const health = await prefixedApp.inject({ method: 'GET', url: '/deezer/api/health' });
    expect(health.statusCode).toBe(200);

    const redirect = await prefixedApp.inject({ method: 'GET', url: '/deezer' });
    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toBe('/deezer/');

    if (hasWebBuild) {
      const index = await prefixedApp.inject({ method: 'GET', url: '/deezer/files/nested' });
      expect(index.statusCode).toBe(200);
      expect(index.headers['content-type']).toMatch(/text\/html/);
      expect(index.body).toContain('<base href="/deezer/" />');
      expect(index.body).toContain('"apiRoot":"/deezer/api"');
    }

    await prefixedApp.close();
    await prefixedScheduler.stop();
  });
});
