import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

import { isPathInside } from '../lib/paths.js';

const QUALITIES = ['mp3', 'flac'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

export type Quality = (typeof QUALITIES)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  deezer: {
    cookieArl: string;
    quality: Quality;
    proxyUrl: string;
  };
  http: {
    host: string;
    port: number;
    urlPrefix: string;
    auth: { user: string; password: string } | undefined;
  };
  downloads: {
    baseDir: string;
    songsDir: string;
    albumsDir: string;
    playlistsDir: string;
    youtubeDir: string;
  };
  queue: {
    workers: number;
    historyLimit: number;
  };
  youtube: {
    playlistMaxEntries: number;
  };
  mpd: {
    enabled: boolean;
    host: string;
    port: number;
    musicDirRoot: string | undefined;
  };
  tools: {
    ytdlpPath: string;
    ffmpegPath: string;
    metaflacPath: string;
  };
  logging: {
    level: LogLevel;
    file: string | undefined;
    debugCommand: string | undefined;
  };
  isProduction: boolean;
}

export interface LoadConfigOptions {
  cwd?: string;
}

export class ConfigError extends Error {
  public readonly issues: string[];

  public constructor(issues: string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

const envText = (fallback = '') =>
  z
    .string()
    .default(fallback)
    .transform((value) => value.trim());

const requiredEnvText = (fallback: string) =>
  envText(fallback).refine((value) => value.length > 0, 'must not be empty');

const optionalEnvText = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  });

const envBoolean = z.preprocess((value) => {
  if (value === undefined || value === '') {
    return false;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return value;
}, z.boolean());

const envInteger = (fallback: number, min: number, max: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? fallback : Number(value)),
    z.number().int().min(min).max(max),
  );

const envEnum = <const Values extends readonly [string, ...string[]]>(values: Values, fallback: Values[number]) =>
  z
    .string()
    .default(fallback)
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.enum(values));

export function normalizeUrlPrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

const envSchema = z.object({
  DEEZER_COOKIE_ARL: z.string().trim().min(1, 'must not be empty'),
  DEEZER_QUALITY: envEnum(QUALITIES, 'mp3'),
  DEEZER_PROXY_URL: envText().refine(
    (value) => value === '' || /^(https:\/\/|socks5h?:\/\/)/.test(value),
    'must start with https://, socks5:// or socks5h://',
  ),
  DEEZER_HTTP_HOST: requiredEnvText('127.0.0.1'),
  DEEZER_HTTP_PORT: envInteger(5000, 1, 65535),
  DEEZER_URL_PREFIX: envText()
    .transform(normalizeUrlPrefix)
    .refine((value) => value === '' || /^\/[A-Za-z0-9._~/-]+$/.test(value), 'must be a path such as /deezer')
    .refine((value) => !value.includes('..'), 'must not contain ".."'),
  DEEZER_AUTH_USER: optionalEnvText,
  DEEZER_AUTH_PASSWORD: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
  DEEZER_WORKERS: envInteger(4, 1, 32),
  DEEZER_TASK_HISTORY: envInteger(500, 10, 10000),
  DEEZER_DOWNLOAD_DIR: requiredEnvText('/tmp/deezer-downloader'),
  DEEZER_SONGS_DIR: optionalEnvText,
  DEEZER_ALBUMS_DIR: optionalEnvText,
  DEEZER_PLAYLISTS_DIR: optionalEnvText,
  DEEZER_YOUTUBE_DIR: optionalEnvText,
  DEEZER_YOUTUBE_PLAYLIST_MAX: envInteger(500, 1, 10000),
  DEEZER_MPD_ENABLED: envBoolean,
  DEEZER_MPD_HOST: requiredEnvText('localhost'),
  DEEZER_MPD_PORT: envInteger(6600, 1, 65535),
  DEEZER_MPD_MUSIC_DIR_ROOT: optionalEnvText,
  DEEZER_YTDLP_PATH: requiredEnvText('yt-dlp'),
  DEEZER_FFMPEG_PATH: requiredEnvText('ffmpeg'),
  DEEZER_METAFLAC_PATH: requiredEnvText('metaflac'),
  DEEZER_LOG_LEVEL: envEnum(LOG_LEVELS, 'info'),
  DEEZER_LOG_FILE: optionalEnvText,
  DEEZER_DEBUG_COMMAND: optionalEnvText,
});

type RawEnv = z.infer<typeof envSchema>;

function expandHome(input: string): string {
  if (input === '~') {
    return os.homedir();
  }
  if (input.startsWith('~/') || input.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function resolvePath(input: string, cwd: string): string {
  return path.resolve(cwd, expandHome(input.trim()));
}

function deepFreeze<T extends object>(value: T): T {
  for (const nested of Object.values(value)) {
    if (typeof nested === 'object' && nested !== null) {
      deepFreeze(nested);
    }
  }
  return Object.freeze(value);
}

function formatZodIssues(env: NodeJS.ProcessEnv, issues: z.core.$ZodIssue[]): string[] {
  const messages = issues.map((issue) => {
    const key = issue.path.join('.') || 'environment';
    if (key === 'DEEZER_COOKIE_ARL' && !env.DEEZER_COOKIE_ARL?.trim()) {
      return 'DEEZER_COOKIE_ARL is required';
    }
    return `${key}: ${issue.message}`;
  });
  return [...new Set(messages)];
}

function resolveDownloadDirectories(raw: RawEnv, cwd: string): AppConfig['downloads'] {
  const baseDir = resolvePath(raw.DEEZER_DOWNLOAD_DIR, cwd);
  const subdirectory = (override: string | undefined, defaultName: string): string =>
    override ? resolvePath(override, cwd) : path.join(baseDir, defaultName);

  return {
    baseDir,
    songsDir: subdirectory(raw.DEEZER_SONGS_DIR, 'songs'),
    albumsDir: subdirectory(raw.DEEZER_ALBUMS_DIR, 'albums'),
    playlistsDir: subdirectory(raw.DEEZER_PLAYLISTS_DIR, 'playlists'),
    youtubeDir: subdirectory(raw.DEEZER_YOUTUBE_DIR, 'youtube-dl'),
  };
}

function crossFieldIssues(raw: RawEnv, downloads: AppConfig['downloads'], musicDirRoot: string | undefined): string[] {
  const issues: string[] = [];

  if (Boolean(raw.DEEZER_AUTH_USER) !== Boolean(raw.DEEZER_AUTH_PASSWORD)) {
    issues.push('DEEZER_AUTH_USER and DEEZER_AUTH_PASSWORD must be set together');
  }
  if (raw.DEEZER_AUTH_USER?.includes(':')) {
    issues.push('DEEZER_AUTH_USER must not contain ":"');
  }

  if (raw.DEEZER_MPD_ENABLED) {
    if (!musicDirRoot) {
      issues.push('DEEZER_MPD_MUSIC_DIR_ROOT is required when DEEZER_MPD_ENABLED=true');
    } else {
      for (const directory of Object.values(downloads)) {
        if (!isPathInside(musicDirRoot, directory)) {
          issues.push(`${directory} must be inside DEEZER_MPD_MUSIC_DIR_ROOT (${musicDirRoot}) when MPD is enabled`);
        }
      }
    }
  }
  return issues;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, options: LoadConfigOptions = {}): AppConfig {
  const cwd = options.cwd ?? process.cwd();
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(formatZodIssues(env, parsed.error.issues));
  }

  const raw = parsed.data;
  const downloads = resolveDownloadDirectories(raw, cwd);
  const musicDirRoot = raw.DEEZER_MPD_MUSIC_DIR_ROOT ? resolvePath(raw.DEEZER_MPD_MUSIC_DIR_ROOT, cwd) : undefined;

  const issues = crossFieldIssues(raw, downloads, musicDirRoot);
  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  return deepFreeze<AppConfig>({
    deezer: {
      cookieArl: raw.DEEZER_COOKIE_ARL,
      quality: raw.DEEZER_QUALITY,
      proxyUrl: raw.DEEZER_PROXY_URL,
    },
    http: {
      host: raw.DEEZER_HTTP_HOST,
      port: raw.DEEZER_HTTP_PORT,
      urlPrefix: raw.DEEZER_URL_PREFIX,
      auth:
        raw.DEEZER_AUTH_USER && raw.DEEZER_AUTH_PASSWORD
          ? { user: raw.DEEZER_AUTH_USER, password: raw.DEEZER_AUTH_PASSWORD }
          : undefined,
    },
    downloads,
    queue: {
      workers: raw.DEEZER_WORKERS,
      historyLimit: raw.DEEZER_TASK_HISTORY,
    },
    youtube: {
      playlistMaxEntries: raw.DEEZER_YOUTUBE_PLAYLIST_MAX,
    },
    mpd: {
      enabled: raw.DEEZER_MPD_ENABLED,
      host: raw.DEEZER_MPD_HOST,
      port: raw.DEEZER_MPD_PORT,
      musicDirRoot,
    },
    tools: {
      ytdlpPath: raw.DEEZER_YTDLP_PATH,
      ffmpegPath: raw.DEEZER_FFMPEG_PATH,
      metaflacPath: raw.DEEZER_METAFLAC_PATH,
    },
    logging: {
      level: raw.DEEZER_LOG_LEVEL,
      file: raw.DEEZER_LOG_FILE ? resolvePath(raw.DEEZER_LOG_FILE, cwd) : undefined,
      debugCommand: raw.DEEZER_DEBUG_COMMAND,
    },
    isProduction: env.NODE_ENV === 'production',
  });
}

export function redactConfig(config: AppConfig): unknown {
  return {
    ...config,
    deezer: {
      ...config.deezer,
      cookieArl: config.deezer.cookieArl ? '[REDACTED]' : '',
    },
    http: {
      ...config.http,
      auth: config.http.auth ? { user: config.http.auth.user, password: '[REDACTED]' } : undefined,
    },
  };
}
