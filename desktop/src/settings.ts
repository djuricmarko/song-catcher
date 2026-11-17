import { z } from 'zod';

export const settingsSchema = z.object({
  arl: z.string().trim(),
  quality: z.enum(['mp3', 'flac']),
  downloadDir: z.string().trim().min(1, 'Choose a download folder'),
  proxyUrl: z
    .string()
    .trim()
    .regex(/^$|^(https:\/\/|socks5h?:\/\/)/, 'The proxy must start with https://, socks5:// or socks5h://'),
  workers: z.number().int().min(1).max(32),
  youtubePlaylistMax: z.number().int().min(1).max(10000),
  mpdEnabled: z.boolean(),
  mpdHost: z.string().trim().min(1, 'Enter the MPD host'),
  mpdPort: z.number().int().min(1).max(65535),
  mpdMusicDir: z.string().trim(),
  theme: z.enum(['system', 'light', 'dark']),
});

export type Settings = z.infer<typeof settingsSchema>;

export type ToolName = 'yt-dlp' | 'ffmpeg' | 'metaflac';
export type ToolPaths = Record<ToolName, string | undefined>;

export const AUTH_USER = 'song-catcher';

export function defaultSettings(downloadDir: string): Settings {
  return {
    arl: '',
    quality: 'mp3',
    downloadDir,
    proxyUrl: '',
    workers: 4,
    youtubePlaylistMax: 500,
    mpdEnabled: false,
    mpdHost: 'localhost',
    mpdPort: 6600,
    mpdMusicDir: '',
    theme: 'system',
  };
}

export function mergeSettings(defaults: Settings, stored: unknown): Settings {
  if (typeof stored !== 'object' || stored === null) {
    return defaults;
  }
  const merged = settingsSchema.safeParse({ ...defaults, ...stored });
  return merged.success ? merged.data : defaults;
}

export function needsRestart(running: Settings, next: Settings): boolean {
  return (Object.keys(next) as Array<keyof Settings>).some((key) => key !== 'theme' && running[key] !== next[key]);
}

export function settingsIssues(error: z.ZodError): string {
  return [...new Set(error.issues.map((issue) => issue.message))].join('\n');
}

export interface ServerRuntime {
  tools: ToolPaths;
  searchPath: string;
  webRoot: string;
  logFile: string;
  port: number;
  password: string;
  version: string;
}

export function serverEnvironment(
  settings: Settings,
  runtime: ServerRuntime,
  inherited: Record<string, string | undefined>,
): Record<string, string> {
  const passthrough = Object.entries(inherited).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && !entry[0].startsWith('DEEZER_'),
  );

  return {
    ...Object.fromEntries(passthrough),
    PATH: runtime.searchPath,
    NODE_ENV: 'production',
    SONG_CATCHER_VERSION: runtime.version,
    SONG_CATCHER_WEB_ROOT: runtime.webRoot,
    DEEZER_COOKIE_ARL: settings.arl,
    DEEZER_QUALITY: settings.quality,
    DEEZER_PROXY_URL: settings.proxyUrl,
    DEEZER_HTTP_HOST: '127.0.0.1',
    DEEZER_HTTP_PORT: String(runtime.port),
    DEEZER_AUTH_USER: AUTH_USER,
    DEEZER_AUTH_PASSWORD: runtime.password,
    DEEZER_WORKERS: String(settings.workers),
    DEEZER_DOWNLOAD_DIR: settings.downloadDir,
    DEEZER_YOUTUBE_PLAYLIST_MAX: String(settings.youtubePlaylistMax),
    DEEZER_MPD_ENABLED: String(settings.mpdEnabled),
    DEEZER_MPD_HOST: settings.mpdHost,
    DEEZER_MPD_PORT: String(settings.mpdPort),
    DEEZER_MPD_MUSIC_DIR_ROOT: settings.mpdMusicDir,
    DEEZER_YTDLP_PATH: runtime.tools['yt-dlp'] ?? 'yt-dlp',
    DEEZER_FFMPEG_PATH: runtime.tools.ffmpeg ?? 'ffmpeg',
    DEEZER_METAFLAC_PATH: runtime.tools.metaflac ?? 'metaflac',
    DEEZER_LOG_FILE: runtime.logFile,
  };
}
