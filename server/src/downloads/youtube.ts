import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { childEnvironment, childStderr, wasKilled } from '../lib/child-process.js';
import { errorMessage } from '../lib/errors.js';

const execFileAsync = promisify(execFile);

/** A stuck yt-dlp must not occupy a download worker forever. */
export const DEFAULT_YTDLP_TIMEOUT_MS = 30 * 60_000;

/** Listing a playlist downloads nothing, so it gets a much shorter leash. */
export const DEFAULT_YTDLP_LIST_TIMEOUT_MS = 5 * 60_000;

/** yt-dlp prints little when downloading one song; this only guards against runaway output. */
const DOWNLOAD_MAX_BUFFER = 16 * 1024 * 1024;

/** Flat playlist JSON carries thumbnails per entry and grows quickly. */
const LIST_MAX_BUFFER = 64 * 1024 * 1024;

export class YoutubeDlError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'YoutubeDlError';
  }
}

export interface YoutubeDlOptions {
  url: string;
  destinationDirectory: string;
  executable: string;
  ffmpegPath?: string;
  proxyUrl?: string;
  timeoutMs?: number;
}

function isAbsolutePath(line: string): boolean {
  return line.startsWith('/') || /^[A-Za-z]:\\/.test(line);
}

/**
 * Finds the finished MP3 in yt-dlp's output: the last absolute path it
 * printed (from `--print after_move:filepath`), else the file named on a
 * `Destination:` progress line.
 */
export function parseYtDlpOutput(stdout: string): string | undefined {
  const printedPath = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .findLast((line) => line.endsWith('.mp3') && isAbsolutePath(line));
  if (printedPath) {
    return printedPath;
  }

  const destination = /Destination:\s(.*\.mp3)/.exec(stdout);
  return destination?.[1]?.trim();
}

/** Appends the proxy and, last, the URL. `--` ensures the URL can never be parsed as an option. */
function pushTargetArguments(args: string[], options: { url: string; proxyUrl?: string }): void {
  const proxyUrl = options.proxyUrl?.trim();
  if (proxyUrl) {
    args.push('--proxy', proxyUrl);
  }
  args.push('--', options.url);
}

async function runYtDlp(
  executable: string,
  args: string[],
  timeoutMs: number,
  maxBuffer: number,
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync(executable, args, {
      maxBuffer,
      env: childEnvironment(),
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    });
  } catch (error) {
    if (wasKilled(error)) {
      throw new YoutubeDlError(`yt-dlp did not finish within ${Math.round(timeoutMs / 1000)} s`, {
        cause: error,
      });
    }
    const details = childStderr(error) ?? errorMessage(error);
    throw new YoutubeDlError(`yt-dlp failed. You may have to update it.\n${details}`, {
      cause: error,
    });
  }
}

/** Downloads the audio of one URL as an MP3 into `destinationDirectory` and returns the file's path. */
export async function downloadWithYtDlp(options: YoutubeDlOptions): Promise<string> {
  // A literal % in the directory (e.g. a playlist called "100% hits") would
  // otherwise be read as an output template field.
  const outputTemplate = path.join(options.destinationDirectory.replaceAll('%', '%%'), '%(title)s.%(ext)s');
  const args = [
    '-x',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '0',
    '-o',
    outputTemplate,
    '--embed-metadata',
    '--no-embed-chapters',
    '--print',
    'after_move:filepath',
    '--no-simulate',
    // A watch URL with &list=... would otherwise download the whole playlist,
    // but only the last file is reported back.
    '--no-playlist',
  ];

  const ffmpegPath = options.ffmpegPath?.trim();
  if (ffmpegPath && (path.isAbsolute(ffmpegPath) || ffmpegPath.includes(path.sep))) {
    args.push('--ffmpeg-location', ffmpegPath);
  }
  pushTargetArguments(args, options);

  const { stdout, stderr } = await runYtDlp(
    options.executable,
    args,
    options.timeoutMs ?? DEFAULT_YTDLP_TIMEOUT_MS,
    DOWNLOAD_MAX_BUFFER,
  );

  const filename = parseYtDlpOutput(stdout);
  if (!filename) {
    throw new YoutubeDlError(`Could not extract the output file from yt-dlp.\nstdout: ${stdout}\nstderr: ${stderr}`);
  }

  try {
    const info = await stat(filename);
    if (!info.isFile()) {
      throw new YoutubeDlError(`yt-dlp reported ${filename}, but it is not a file`);
    }
  } catch (error) {
    if (error instanceof YoutubeDlError) {
      throw error;
    }
    throw new YoutubeDlError(`yt-dlp reported ${filename}, but it does not exist`, {
      cause: error,
    });
  }

  return filename;
}

export interface YoutubePlaylistEntry {
  /** Stable identifier of the entry, used to recognise already downloaded songs. */
  id: string;
  url: string;
  title: string;
}

export interface YoutubePlaylist {
  title: string;
  entries: YoutubePlaylistEntry[];
  /** True when the playlist has more entries than `maxEntries`. */
  truncated: boolean;
}

export interface YoutubePlaylistOptions {
  url: string;
  executable: string;
  /** Entries beyond this are ignored; endless "mix" playlists would never finish otherwise. */
  maxEntries: number;
  proxyUrl?: string;
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isHttpUrl(value: string | undefined): value is string {
  return value !== undefined && /^https?:\/\//i.test(value);
}

function collectEntries(node: Record<string, unknown>, entries: YoutubePlaylistEntry[], seen: Set<string>): void {
  const children = node.entries;
  if (Array.isArray(children)) {
    // Channels and some sites nest playlists inside playlists.
    for (const child of children) {
      if (isRecord(child)) {
        collectEntries(child, entries, seen);
      }
    }
    return;
  }

  const candidates = [textField(node, 'url'), textField(node, 'webpage_url'), textField(node, 'original_url')];
  const url = candidates.find(isHttpUrl);
  if (!url) {
    return;
  }
  const id = textField(node, 'id') ?? url;
  if (seen.has(id)) {
    return;
  }
  seen.add(id);
  entries.push({ id, url, title: textField(node, 'title') ?? id });
}

/** Parses `yt-dlp --flat-playlist -J` output. A single video becomes a one-entry playlist. */
export function parseYtDlpPlaylist(stdout: string, maxEntries: number): YoutubePlaylist {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new YoutubeDlError('Could not parse the playlist information from yt-dlp', { cause: error });
  }
  if (!isRecord(parsed)) {
    throw new YoutubeDlError('yt-dlp returned unexpected playlist information');
  }

  const entries: YoutubePlaylistEntry[] = [];
  collectEntries(parsed, entries, new Set());
  const title = textField(parsed, 'title') ?? textField(parsed, 'id') ?? 'playlist';
  return {
    title,
    entries: entries.slice(0, maxEntries),
    truncated: entries.length > maxEntries,
  };
}

/** Lists the entries of a playlist without downloading anything. */
export async function listYtDlpPlaylist(options: YoutubePlaylistOptions): Promise<YoutubePlaylist> {
  const args = [
    '--flat-playlist',
    '--dump-single-json',
    '--no-warnings',
    // A watch URL with &list=... must expand to the whole playlist here.
    '--yes-playlist',
    // One extra entry reveals whether the playlist was cut off.
    '--playlist-end',
    String(options.maxEntries + 1),
  ];
  pushTargetArguments(args, options);

  const { stdout } = await runYtDlp(
    options.executable,
    args,
    options.timeoutMs ?? DEFAULT_YTDLP_LIST_TIMEOUT_MS,
    LIST_MAX_BUFFER,
  );
  return parseYtDlpPlaylist(stdout, options.maxEntries);
}
