import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

import { isPathInside } from '../lib/paths.js';

const QUALITIES = ['mp3', 'flac'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

export type Quality = (typeof QUALITIES)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

/** The validated configuration of the whole app. Deeply frozen; read it, never change it. */
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
    /** HTTP Basic credentials; undefined disables authentication. */
    auth: { user: string; password: string } | undefined;
  };
  downloads: {
    baseDir: string;
    songsDir: string;
    albumsDir: string;
    playlistsDir: string;
    zipsDir: string;
    youtubeDir: string;
  };
  queue: {
    workers: number;
    historyLimit: number;
  };
  youtube: {
    /** Upper bound of songs taken from one playlist. */
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

/** Thrown by `loadConfig`; its message lists every problem so they can be fixed in one go. */
export class ConfigError extends Error {
  public readonly issues: string[];

  public constructor(issues: string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

const DEFAULT_DOWNLOAD_DIR = '/tmp/deezer-downloader';
const TRUE_VALUES = ['true', '1', 'yes', 'on'];
const FALSE_VALUES = ['false', '0', 'no', 'off'];

// --- Building blocks for environment variables ---------------------------------
// Variables arrive as strings, or not at all. Each helper turns one into a
// trimmed, typed value and applies a default when it is unset.

const envText = (fallback = '') =>
  z
    .string()
    .default(fallback)
    .transform((value) => value.trim());

const requiredEnvText = (fallback: string) =>
  envText(fallback).refine((value) => value.length > 0, 'must not be empty');

/** Unset and blank both mean "not configured". */
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
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.includes(normalized)) {
    return true;
  }
  if (FALSE_VALUES.includes(normalized)) {
    return false;
  }
  // Left as it is, so validation fails and names the variable.
  return value;
}, z.boolean());

const envInteger = (fallback: number, min: number, max: number) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? fallback : Number(value)),
    z.number().int().min(min).max(max),
  );

/** One of a fixed set of words, in any letter case. */
const envEnum = <const Values extends readonly [string, ...string[]]>(values: Values, fallback: Values[number]) =>
  z
    .string()
    .default(fallback)
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.enum(values));

/** Turns `deezer`, `/deezer/` and the like into `/deezer`; no prefix becomes an empty string. */
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
  // Not trimmed: a password may deliberately start or end with a space.
  DEEZER_AUTH_PASSWORD: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined)),
  DEEZER_WORKERS: envInteger(4, 1, 32),
  DEEZER_TASK_HISTORY: envInteger(500, 10, 10000),
  DEEZER_DOWNLOAD_DIR: requiredEnvText(DEFAULT_DOWNLOAD_DIR),
  DEEZER_SONGS_DIR: optionalEnvText,
  DEEZER_ALBUMS_DIR: optionalEnvText,
  DEEZER_PLAYLISTS_DIR: optionalEnvText,
  DEEZER_ZIPS_DIR: optionalEnvText,
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

/** Makes a configured path absolute: `~` is the home directory, relative paths start at `cwd`. */
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

/** One line per problem, each starting with the variable it is about. */
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
    zipsDir: subdirectory(raw.DEEZER_ZIPS_DIR, 'zips'),
    youtubeDir: subdirectory(raw.DEEZER_YOUTUBE_DIR, 'youtube-dl'),
  };
}

/** Rules that involve more than one variable and so cannot live in the schema. */
function crossFieldIssues(raw: RawEnv, downloads: AppConfig['downloads'], musicDirRoot: string | undefined): string[] {
  const issues: string[] = [];

  if (Boolean(raw.DEEZER_AUTH_USER) !== Boolean(raw.DEEZER_AUTH_PASSWORD)) {
    issues.push('DEEZER_AUTH_USER and DEEZER_AUTH_PASSWORD must be set together');
  }
  if (raw.DEEZER_AUTH_USER?.includes(':')) {
    // HTTP Basic auth separates user and password with the first colon.
    issues.push('DEEZER_AUTH_USER must not contain ":"');
  }

  if (raw.DEEZER_MPD_ENABLED) {
    if (!musicDirRoot) {
      issues.push('DEEZER_MPD_MUSIC_DIR_ROOT is required when DEEZER_MPD_ENABLED=true');
    } else {
      // MPD can only play files it finds below its music directory.
      for (const directory of Object.values(downloads)) {
        if (!isPathInside(musicDirRoot, directory)) {
          issues.push(`${directory} must be inside DEEZER_MPD_MUSIC_DIR_ROOT (${musicDirRoot}) when MPD is enabled`);
        }
      }
    }
  }
  return issues;
}

/**
 * Pure configuration loader. It validates and normalizes environment variables
 * but does not touch the filesystem; see `checkEnvironment` for that.
 *
 * @throws ConfigError listing every invalid or missing variable.
 */
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

/** A copy of the configuration that is safe to print: the ARL and the password are masked. */
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
