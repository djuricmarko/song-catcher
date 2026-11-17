import { loadConfig } from '@song-catcher/server';
import { describe, expect, it } from 'vitest';

import {
  AUTH_USER,
  defaultSettings,
  mergeSettings,
  needsRestart,
  serverEnvironment,
  settingsIssues,
  settingsSchema,
  type ServerRuntime,
} from '../src/settings.js';

const defaults = defaultSettings('/music/Song Catcher');

const runtime: ServerRuntime = {
  tools: { 'yt-dlp': '/app/bin/yt-dlp', ffmpeg: '/app/bin/ffmpeg', metaflac: undefined },
  searchPath: '/app/bin:/usr/bin',
  webRoot: '/app/web',
  logFile: '/logs/song-catcher.log',
  port: 38945,
  password: 'secret',
  version: '9.9.9',
};

describe('mergeSettings', () => {
  it('falls back to the defaults when nothing usable is stored', () => {
    expect(mergeSettings(defaults, undefined)).toEqual(defaults);
    expect(mergeSettings(defaults, 'broken')).toEqual(defaults);
    expect(mergeSettings(defaults, { workers: 'many' })).toEqual(defaults);
  });

  it('keeps stored values and fills in settings added later', () => {
    expect(mergeSettings(defaults, { arl: ' abc ', quality: 'flac', workers: 8 })).toEqual({
      ...defaults,
      arl: 'abc',
      quality: 'flac',
      workers: 8,
    });
  });
});

describe('settingsSchema', () => {
  it('rejects a proxy the server would refuse', () => {
    const result = settingsSchema.safeParse({ ...defaults, proxyUrl: 'http://proxy:8080' });

    expect(result.success).toBe(false);
    expect(result.error && settingsIssues(result.error)).toContain('socks5://');
  });

  it('knows the three themes and nothing else', () => {
    expect(defaults.theme).toBe('system');
    expect(settingsSchema.safeParse({ ...defaults, theme: 'dark' }).success).toBe(true);
    expect(settingsSchema.safeParse({ ...defaults, theme: 'sepia' }).success).toBe(false);
  });

  it('accepts a socks proxy', () => {
    expect(settingsSchema.safeParse({ ...defaults, proxyUrl: 'socks5h://127.0.0.1:9050' }).success).toBe(true);
  });
});

describe('needsRestart', () => {
  it('restarts the download service for anything it reads', () => {
    expect(needsRestart(defaults, { ...defaults, arl: 'fresh' })).toBe(true);
    expect(needsRestart(defaults, { ...defaults, workers: 8 })).toBe(true);
  });

  it('leaves it running for the theme or no change', () => {
    expect(needsRestart(defaults, { ...defaults, theme: 'dark' })).toBe(false);
    expect(needsRestart(defaults, { ...defaults })).toBe(false);
  });
});

describe('serverEnvironment', () => {
  const settings = { ...defaults, arl: 'a'.repeat(192) };

  it('produces a configuration the server accepts', () => {
    const config = loadConfig(serverEnvironment(settings, runtime, {}));

    expect(config.deezer.cookieArl).toBe(settings.arl);
    expect(config.http).toEqual({
      host: '127.0.0.1',
      port: 38945,
      urlPrefix: '',
      auth: { user: AUTH_USER, password: 'secret' },
    });
    expect(config.downloads.baseDir).toBe('/music/Song Catcher');
    expect(config.tools).toEqual({
      ytdlpPath: '/app/bin/yt-dlp',
      ffmpegPath: '/app/bin/ffmpeg',
      metaflacPath: 'metaflac',
    });
    expect(config.logging.file).toBe('/logs/song-catcher.log');
    expect(config.mpd.enabled).toBe(false);
  });

  it('passes MPD settings through', () => {
    const config = loadConfig(
      serverEnvironment(
        { ...settings, downloadDir: '/music/catcher', mpdEnabled: true, mpdHost: 'mpd.lan', mpdMusicDir: '/music' },
        runtime,
        {},
      ),
    );

    expect(config.mpd).toEqual({ enabled: true, host: 'mpd.lan', port: 6600, musicDirRoot: '/music' });
  });

  it('keeps the inherited environment but not stray server settings', () => {
    const environment = serverEnvironment(settings, runtime, {
      HOME: '/home/someone',
      PATH: '/usr/bin',
      UNSET: undefined,
      DEEZER_URL_PREFIX: '/elsewhere',
      DEEZER_DEBUG_COMMAND: 'id',
    });

    expect(environment.HOME).toBe('/home/someone');
    expect(environment.PATH).toBe('/app/bin:/usr/bin');
    expect(environment).not.toHaveProperty('UNSET');
    expect(environment).not.toHaveProperty('DEEZER_URL_PREFIX');
    expect(environment).not.toHaveProperty('DEEZER_DEBUG_COMMAND');
    expect(environment.SONG_CATCHER_VERSION).toBe('9.9.9');
    expect(environment.SONG_CATCHER_WEB_ROOT).toBe('/app/web');
  });
});
