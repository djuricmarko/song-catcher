import { accessSync, constants as fsConstants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

export type Quality = 'mp3' | 'flac';
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

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

export interface EnvironmentReport {
  errors: string[];
  warnings: string[];
  tools: Record<ToolName, string | undefined>;
  directories: string[];
}

export type ToolName = 'ytDlp' | 'ffmpeg' | 'metaflac';

export class ConfigError extends Error {
  public readonly issues: string[];

  public constructor(issues: string[]) {
    super(`Invalid configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

const DEFAULT_DOWNLOAD_DIR = '/tmp/deezer-downloader';

const envText = (fallback = '') =>
  z
    .string()
    .default(fallback)
    .transform((value) => value.trim());

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

const envQuality = z
  .string()
  .default('mp3')
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(['mp3', 'flac']));

const envLogLevel = z
  .string()
  .default('info')
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']));

export function normalizeUrlPrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

const rawSchema = z.object({
  DEEZER_COOKIE_ARL: z.string().trim().min(1, 'must not be empty'),
  DEEZER_QUALITY: envQuality,
  DEEZER_PROXY_URL: envText().refine(
    (value) => value === '' || /^(https:\/\/|socks5h?:\/\/)/.test(value),
    'must start with https://, socks5:// or socks5h://',
  ),
  DEEZER_HTTP_HOST: envText('127.0.0.1').refine((value) => value.length > 0, 'must not be empty'),
  DEEZER_HTTP_PORT: envInteger(5000, 1, 65535),
  DEEZER_URL_PREFIX: envText()
    .transform(normalizeUrlPrefix)
    .refine(
      (value) => value === '' || /^\/[A-Za-z0-9._~/-]+$/.test(value),
      'must be a path such as /deezer',
    )
    .refine((value) => !value.includes('..'), 'must not contain ".."'),
  DEEZER_WORKERS: envInteger(4, 1, 32),
  DEEZER_TASK_HISTORY: envInteger(500, 10, 10000),
  DEEZER_DOWNLOAD_DIR: envText(DEFAULT_DOWNLOAD_DIR).refine(
    (value) => value.length > 0,
    'must not be empty',
  ),
  DEEZER_SONGS_DIR: optionalEnvText,
  DEEZER_ALBUMS_DIR: optionalEnvText,
  DEEZER_PLAYLISTS_DIR: optionalEnvText,
  DEEZER_ZIPS_DIR: optionalEnvText,
  DEEZER_YOUTUBE_DIR: optionalEnvText,
  DEEZER_MPD_ENABLED: envBoolean,
  DEEZER_MPD_HOST: envText('localhost').refine((value) => value.length > 0, 'must not be empty'),
  DEEZER_MPD_PORT: envInteger(6600, 1, 65535),
  DEEZER_MPD_MUSIC_DIR_ROOT: optionalEnvText,
  DEEZER_YTDLP_PATH: envText('yt-dlp').refine((value) => value.length > 0, 'must not be empty'),
  DEEZER_FFMPEG_PATH: envText('ffmpeg').refine((value) => value.length > 0, 'must not be empty'),
  DEEZER_METAFLAC_PATH: envText('metaflac').refine(
    (value) => value.length > 0,
    'must not be empty',
  ),
  DEEZER_LOG_LEVEL: envLogLevel,
  DEEZER_LOG_FILE: optionalEnvText,
  DEEZER_DEBUG_COMMAND: optionalEnvText,
});

function expandHome(input: string): string {
  if (input === '~') {
    return os.homedir();
  }
  if (input.startsWith('~/') || input.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

export function resolvePath(input: string, cwd: string): string {
  return path.resolve(cwd, expandHome(input.trim()));
}

export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
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

/**
 * Pure configuration loader. It validates and normalizes environment variables
 * but does not touch the filesystem.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadConfigOptions = {},
): AppConfig {
  const cwd = options.cwd ?? process.cwd();
  const parsed = rawSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(formatZodIssues(env, parsed.error.issues));
  }

  const raw = parsed.data;
  const baseDir = resolvePath(raw.DEEZER_DOWNLOAD_DIR, cwd);
  const downloads = {
    baseDir,
    songsDir: raw.DEEZER_SONGS_DIR
      ? resolvePath(raw.DEEZER_SONGS_DIR, cwd)
      : path.join(baseDir, 'songs'),
    albumsDir: raw.DEEZER_ALBUMS_DIR
      ? resolvePath(raw.DEEZER_ALBUMS_DIR, cwd)
      : path.join(baseDir, 'albums'),
    playlistsDir: raw.DEEZER_PLAYLISTS_DIR
      ? resolvePath(raw.DEEZER_PLAYLISTS_DIR, cwd)
      : path.join(baseDir, 'playlists'),
    zipsDir: raw.DEEZER_ZIPS_DIR
      ? resolvePath(raw.DEEZER_ZIPS_DIR, cwd)
      : path.join(baseDir, 'zips'),
    youtubeDir: raw.DEEZER_YOUTUBE_DIR
      ? resolvePath(raw.DEEZER_YOUTUBE_DIR, cwd)
      : path.join(baseDir, 'youtube-dl'),
  };

  const musicDirRoot = raw.DEEZER_MPD_MUSIC_DIR_ROOT
    ? resolvePath(raw.DEEZER_MPD_MUSIC_DIR_ROOT, cwd)
    : undefined;

  const issues: string[] = [];
  if (raw.DEEZER_MPD_ENABLED) {
    if (!musicDirRoot) {
      issues.push('DEEZER_MPD_MUSIC_DIR_ROOT is required when DEEZER_MPD_ENABLED=true');
    } else {
      for (const directory of Object.values(downloads)) {
        if (!isPathInside(musicDirRoot, directory)) {
          issues.push(
            `${directory} must be inside DEEZER_MPD_MUSIC_DIR_ROOT (${musicDirRoot}) when MPD is enabled`,
          );
        }
      }
    }
  }
  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  return Object.freeze({
    deezer: Object.freeze({
      cookieArl: raw.DEEZER_COOKIE_ARL,
      quality: raw.DEEZER_QUALITY,
      proxyUrl: raw.DEEZER_PROXY_URL,
    }),
    http: Object.freeze({
      host: raw.DEEZER_HTTP_HOST,
      port: raw.DEEZER_HTTP_PORT,
      urlPrefix: raw.DEEZER_URL_PREFIX,
    }),
    downloads: Object.freeze(downloads),
    queue: Object.freeze({
      workers: raw.DEEZER_WORKERS,
      historyLimit: raw.DEEZER_TASK_HISTORY,
    }),
    mpd: Object.freeze({
      enabled: raw.DEEZER_MPD_ENABLED,
      host: raw.DEEZER_MPD_HOST,
      port: raw.DEEZER_MPD_PORT,
      musicDirRoot,
    }),
    tools: Object.freeze({
      ytdlpPath: raw.DEEZER_YTDLP_PATH,
      ffmpegPath: raw.DEEZER_FFMPEG_PATH,
      metaflacPath: raw.DEEZER_METAFLAC_PATH,
    }),
    logging: Object.freeze({
      level: raw.DEEZER_LOG_LEVEL,
      file: raw.DEEZER_LOG_FILE ? resolvePath(raw.DEEZER_LOG_FILE, cwd) : undefined,
      debugCommand: raw.DEEZER_DEBUG_COMMAND,
    }),
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
  };
}

export function resolveExecutable(
  command: string,
  envPath: string = process.env.PATH ?? '',
): string | undefined {
  const trimmed = command.trim();
  if (!trimmed) {
    return undefined;
  }

  const candidates =
    trimmed.includes('/') || trimmed.includes('\\')
      ? [trimmed]
      : envPath
          .split(path.delimiter)
          .filter(Boolean)
          .map((directory) => path.join(directory, trimmed));

  for (const candidate of candidates) {
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Try the next PATH entry.
    }
  }
  return undefined;
}

/**
 * Filesystem and executable checks performed at startup and by `--check`.
 */
export async function checkEnvironment(config: AppConfig): Promise<EnvironmentReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tools: Record<ToolName, string | undefined> = {
    ytDlp: resolveExecutable(config.tools.ytdlpPath),
    ffmpeg: resolveExecutable(config.tools.ffmpegPath),
    metaflac: resolveExecutable(config.tools.metaflacPath),
  };

  const toolVariables: Array<[ToolName, string, string]> = [
    ['ytDlp', 'DEEZER_YTDLP_PATH', config.tools.ytdlpPath],
    ['ffmpeg', 'DEEZER_FFMPEG_PATH', config.tools.ffmpegPath],
    ['metaflac', 'DEEZER_METAFLAC_PATH', config.tools.metaflacPath],
  ];
  for (const [tool, variable, command] of toolVariables) {
    if (!tools[tool]) {
      errors.push(`${variable}: executable not found: ${command}`);
    }
  }

  const directories = [
    ...new Set([
      config.downloads.baseDir,
      config.downloads.songsDir,
      config.downloads.albumsDir,
      config.downloads.playlistsDir,
      config.downloads.zipsDir,
      config.downloads.youtubeDir,
    ]),
  ];
  for (const directory of directories) {
    try {
      await mkdir(directory, { recursive: true });
      await access(directory, fsConstants.W_OK);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`cannot create or write directory ${directory}: ${message}`);
    }
  }

  return { errors, warnings, tools, directories };
}
