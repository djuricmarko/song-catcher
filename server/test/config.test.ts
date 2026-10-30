import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ConfigError,
  checkEnvironment,
  isPathInside,
  loadConfig,
  normalizeUrlPrefix,
  redactConfig,
  resolveExecutable,
} from '../src/config/env.js';

const ARL = 'a'.repeat(192);
const minimalEnv = { DEEZER_COOKIE_ARL: ARL };
const tempDirectories: string[] = [];

function load(env: Record<string, string | undefined> = {}, cwd = '/work') {
  return loadConfig({ ...minimalEnv, ...env }, { cwd });
}

async function makeTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'deezer-downloader-test-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('loadConfig defaults', () => {
  it('applies defaults for a minimal environment', () => {
    const config = load({}, '/work');

    expect(config.deezer).toEqual({ cookieArl: ARL, quality: 'mp3', proxyUrl: '' });
    expect(config.http).toEqual({ host: '127.0.0.1', port: 5000, urlPrefix: '' });
    expect(config.downloads).toEqual({
      baseDir: '/tmp/deezer-downloader',
      songsDir: '/tmp/deezer-downloader/songs',
      albumsDir: '/tmp/deezer-downloader/albums',
      playlistsDir: '/tmp/deezer-downloader/playlists',
      zipsDir: '/tmp/deezer-downloader/zips',
      youtubeDir: '/tmp/deezer-downloader/youtube-dl',
    });
    expect(config.queue).toEqual({ workers: 4, historyLimit: 500 });
    expect(config.mpd).toEqual({
      enabled: false,
      host: 'localhost',
      port: 6600,
      musicDirRoot: undefined,
    });
    expect(config.tools).toEqual({
      ytdlpPath: 'yt-dlp',
      ffmpegPath: 'ffmpeg',
      metaflacPath: 'metaflac',
    });
    expect(config.logging).toEqual({ level: 'info', file: undefined, debugCommand: undefined });
    expect(config.isProduction).toBe(false);
  });

  it('parses custom values and trims whitespace', () => {
    const config = load({
      DEEZER_QUALITY: ' FLAC ',
      DEEZER_PROXY_URL: ' socks5h://127.0.0.1:9050 ',
      DEEZER_HTTP_HOST: ' 0.0.0.0 ',
      DEEZER_HTTP_PORT: '8080',
      DEEZER_URL_PREFIX: 'deezer/',
      DEEZER_WORKERS: '8',
      DEEZER_TASK_HISTORY: '100',
      DEEZER_LOG_LEVEL: ' DEBUG ',
      NODE_ENV: 'production',
    });

    expect(config.deezer.quality).toBe('flac');
    expect(config.deezer.proxyUrl).toBe('socks5h://127.0.0.1:9050');
    expect(config.http).toEqual({ host: '0.0.0.0', port: 8080, urlPrefix: '/deezer' });
    expect(config.queue).toEqual({ workers: 8, historyLimit: 100 });
    expect(config.logging.level).toBe('debug');
    expect(config.isProduction).toBe(true);
  });

  it('derives download subdirectories from a custom base directory', () => {
    const config = load({ DEEZER_DOWNLOAD_DIR: '/srv/music/deezer' });

    expect(config.downloads.baseDir).toBe('/srv/music/deezer');
    expect(config.downloads.songsDir).toBe('/srv/music/deezer/songs');
    expect(config.downloads.youtubeDir).toBe('/srv/music/deezer/youtube-dl');
  });

  it('honors explicit download subdirectory overrides', () => {
    const config = load({
      DEEZER_DOWNLOAD_DIR: '/srv/music/deezer',
      DEEZER_SONGS_DIR: '/srv/music/songs',
      DEEZER_YOUTUBE_DIR: 'youtube',
    });

    expect(config.downloads.songsDir).toBe('/srv/music/songs');
    expect(config.downloads.youtubeDir).toBe('/work/youtube');
    expect(config.downloads.albumsDir).toBe('/srv/music/deezer/albums');
  });

  it('resolves relative paths against the supplied cwd', () => {
    const config = load(
      {
        DEEZER_DOWNLOAD_DIR: 'downloads',
        DEEZER_LOG_FILE: 'logs/app.log',
      },
      '/srv/app',
    );

    expect(config.downloads.baseDir).toBe('/srv/app/downloads');
    expect(config.logging.file).toBe('/srv/app/logs/app.log');
  });

  it('accepts every boolean spelling', () => {
    for (const value of ['true', '1', 'yes', 'on', 'TRUE']) {
      expect(
        load({
          DEEZER_MPD_ENABLED: value,
          DEEZER_MPD_MUSIC_DIR_ROOT: '/music',
          DEEZER_DOWNLOAD_DIR: '/music/deezer',
        }).mpd.enabled,
      ).toBe(true);
    }
    for (const value of ['false', '0', 'no', 'off', 'FALSE', '']) {
      expect(load({ DEEZER_MPD_ENABLED: value }).mpd.enabled).toBe(false);
    }
  });
});

describe('loadConfig validation', () => {
  it('requires DEEZER_COOKIE_ARL', () => {
    expect(() => loadConfig({}, { cwd: '/work' })).toThrowError(ConfigError);
    expect(() => loadConfig({}, { cwd: '/work' })).toThrowError(/DEEZER_COOKIE_ARL is required/);
  });

  it('rejects an empty ARL', () => {
    expect(() => loadConfig({ DEEZER_COOKIE_ARL: '   ' }, { cwd: '/work' })).toThrowError(
      /DEEZER_COOKIE_ARL is required/,
    );
  });

  it('rejects an invalid quality', () => {
    expect(() => load({ DEEZER_QUALITY: 'ogg' })).toThrowError(/DEEZER_QUALITY/);
  });

  it.each(['0', '65536', 'abc'])('rejects an invalid port: %s', (port) => {
    expect(() => load({ DEEZER_HTTP_PORT: port })).toThrowError(/DEEZER_HTTP_PORT/);
  });

  it.each(['0', '33', '2.5'])('rejects an invalid worker count: %s', (workers) => {
    expect(() => load({ DEEZER_WORKERS: workers })).toThrowError(/DEEZER_WORKERS/);
  });

  it('rejects unsupported proxy schemes', () => {
    expect(() => load({ DEEZER_PROXY_URL: 'http://proxy:8080' })).toThrowError(/DEEZER_PROXY_URL/);
    expect(() => load({ DEEZER_PROXY_URL: 'socks4://proxy:1080' })).toThrowError(
      /DEEZER_PROXY_URL/,
    );
  });

  it('accepts supported proxy schemes', () => {
    for (const proxy of [
      'https://user:pass@proxy:8080',
      'socks5://127.0.0.1:1080',
      'socks5h://127.0.0.1:1080',
    ]) {
      expect(load({ DEEZER_PROXY_URL: proxy }).deezer.proxyUrl).toBe(proxy);
    }
  });

  it('requires an MPD music root when MPD is enabled', () => {
    expect(() => load({ DEEZER_MPD_ENABLED: 'true' })).toThrowError(
      /DEEZER_MPD_MUSIC_DIR_ROOT is required/,
    );
  });

  it('rejects download directories outside the MPD music root', () => {
    expect(() =>
      load({
        DEEZER_MPD_ENABLED: 'true',
        DEEZER_MPD_MUSIC_DIR_ROOT: '/music',
        DEEZER_DOWNLOAD_DIR: '/tmp/deezer-downloader',
      }),
    ).toThrowError(/must be inside DEEZER_MPD_MUSIC_DIR_ROOT/);
  });

  it('accepts download directories inside the MPD music root', () => {
    const config = load({
      DEEZER_MPD_ENABLED: 'true',
      DEEZER_MPD_MUSIC_DIR_ROOT: '/music',
      DEEZER_DOWNLOAD_DIR: '/music/deezer',
    });

    expect(config.mpd.musicDirRoot).toBe('/music');
    expect(config.downloads.baseDir).toBe('/music/deezer');
  });

  it('rejects a traversal URL prefix', () => {
    expect(() => load({ DEEZER_URL_PREFIX: '/../admin' })).toThrowError(/DEEZER_URL_PREFIX/);
  });
});

describe('normalizeUrlPrefix', () => {
  it.each([
    ['', ''],
    ['/', ''],
    ['deezer', '/deezer'],
    ['/deezer', '/deezer'],
    ['deezer/', '/deezer'],
    ['//deezer//', '/deezer'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeUrlPrefix(input)).toBe(expected);
  });
});

describe('redactConfig', () => {
  it('never exposes the ARL', () => {
    const redacted = redactConfig(load()) as { deezer: { cookieArl: string } };
    expect(redacted.deezer.cookieArl).toBe('[REDACTED]');
    expect(JSON.stringify(redacted)).not.toContain(ARL);
  });
});

describe('resolveExecutable', () => {
  it('finds the current node binary by absolute path', () => {
    expect(resolveExecutable(process.execPath)).toBe(process.execPath);
  });

  it('finds an executable on PATH', () => {
    const directory = path.dirname(process.execPath);
    expect(resolveExecutable(path.basename(process.execPath), directory)).toBe(process.execPath);
  });

  it('returns undefined for a missing executable', () => {
    expect(resolveExecutable('/definitely/not/here')).toBeUndefined();
  });
});

describe('isPathInside', () => {
  it.each([
    ['/music', '/music', true],
    ['/music', '/music/deezer', true],
    ['/music', '/music/deezer/songs', true],
    ['/music', '/music-other', false],
    ['/music', '/', false],
    ['/music', '/music/../etc', false],
  ])('isPathInside(%j, %j) is %s', (parent, child, expected) => {
    expect(isPathInside(parent, child)).toBe(expected);
  });
});

describe('checkEnvironment', () => {
  it('creates directories and resolves tools', async () => {
    const directory = await makeTempDirectory();
    const config = load({
      DEEZER_DOWNLOAD_DIR: directory,
      DEEZER_YTDLP_PATH: process.execPath,
      DEEZER_FFMPEG_PATH: process.execPath,
      DEEZER_METAFLAC_PATH: process.execPath,
    });

    const report = await checkEnvironment(config);

    expect(report.errors).toEqual([]);
    expect(report.tools.ytDlp).toBe(process.execPath);
    for (const pathToCheck of report.directories) {
      await expect(stat(pathToCheck)).resolves.toBeDefined();
    }
  });

  it('reports missing executables', async () => {
    const directory = await makeTempDirectory();
    const config = load({
      DEEZER_DOWNLOAD_DIR: directory,
      DEEZER_YTDLP_PATH: '/definitely/not/here',
      DEEZER_FFMPEG_PATH: process.execPath,
      DEEZER_METAFLAC_PATH: process.execPath,
    });

    const report = await checkEnvironment(config);

    expect(report.errors).toEqual([
      'DEEZER_YTDLP_PATH: executable not found: /definitely/not/here',
    ]);
  });
});
