import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';

import { childEnvironment, childStderr, wasKilled } from '../lib/child-process.js';
import { errorMessage } from '../lib/errors.js';
import { cumulativeTransfer, type TransferReporter } from '../lib/transfer.js';

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
  onInfo?: ((info: YoutubeVideoInfo) => void) | undefined;
  onTransfer?: TransferReporter | undefined;
}

export interface YoutubeVideoInfo {
  title: string;
  uploadDate: string | undefined;
}

function isAbsolutePath(line: string): boolean {
  return line.startsWith('/') || /^[A-Za-z]:\\/.test(line);
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseYtDlpInfo(line: string): YoutubeVideoInfo | undefined {
  if (!line.startsWith('{')) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) {
    return undefined;
  }
  const title = textField(parsed, 'title');
  if (!title) {
    return undefined;
  }
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(textField(parsed, 'upload_date') ?? '');
  return { title, uploadDate: date ? `${date[1]}-${date[2]}-${date[3]}` : undefined };
}

export function parseYtDlpTransfer(line: string): { transferred: number; total: number | undefined } | undefined {
  const match = /^\[transfer] ([\d.]+) ([\d.]+|NA)$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number(match[2]);
  return { transferred: Number(match[1]), total: total > 0 ? total : undefined };
}

async function runYtDlp(
  executable: string,
  args: string[],
  timeoutMs: number,
  maxBuffer: number,
  onLine?: (line: string) => void,
): Promise<{ stdout: string; stderr: string }> {
  try {
    const running = promisify(execFile)(executable, args, {
      maxBuffer,
      env: childEnvironment(),
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    });
    if (onLine) {
      for (const output of [running.child.stdout, running.child.stderr]) {
        if (output) {
          createInterface({ input: output }).on('line', onLine);
        }
      }
    }
    return await running;
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
    'before_dl:%(.{title,upload_date})j',
    '--print',
    'after_move:filepath',
    '--no-simulate',
    '--progress',
    '--newline',
    '--progress-template',
    'download:[transfer] %(progress.downloaded_bytes)s %(progress.total_bytes,total_bytes_estimate)s',
    '--progress-template',
    'postprocess:[convert] %(progress.postprocessor)s',
    // A watch URL with &list=... would otherwise download the whole playlist,
    // but only the last file is reported back.
    '--no-playlist',
  ];

  const ffmpegPath = options.ffmpegPath?.trim();
  if (ffmpegPath && (path.isAbsolute(ffmpegPath) || ffmpegPath.includes(path.sep))) {
    args.push('--ffmpeg-location', ffmpegPath);
  }
  pushTargetArguments(args, options);

  const { onInfo, onTransfer } = options;
  const track = onTransfer && cumulativeTransfer(onTransfer);
  const { stdout, stderr } = await runYtDlp(
    options.executable,
    args,
    options.timeoutMs ?? 30 * 60_000,
    16 * 1024 * 1024,
    (line) => {
      const trimmed = line.trim();
      const transfer = parseYtDlpTransfer(trimmed);
      if (transfer) {
        track?.(transfer.transferred, transfer.total);
        return;
      }
      if (trimmed.startsWith('[convert] ')) {
        onTransfer?.({ bytes: 0, elapsedMs: 0, fraction: null });
        return;
      }
      const info = parseYtDlpInfo(trimmed);
      if (info) {
        onInfo?.(info);
      }
    },
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
  id: string;
  url: string;
  title: string;
}

export interface YoutubePlaylist {
  title: string;
  entries: YoutubePlaylistEntry[];
  truncated: boolean;
}

export interface YoutubePlaylistOptions {
  url: string;
  executable: string;
  maxEntries: number;
  proxyUrl?: string;
  timeoutMs?: number;
}

function isHttpUrl(value: string | undefined): value is string {
  return value !== undefined && /^https?:\/\//i.test(value);
}

function collectEntries(node: Record<string, unknown>, entries: YoutubePlaylistEntry[], seen: Set<string>): void {
  const children = node.entries;
  if (Array.isArray(children)) {
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

export async function listYtDlpPlaylist(options: YoutubePlaylistOptions): Promise<YoutubePlaylist> {
  const args = [
    '--flat-playlist',
    '--dump-single-json',
    '--no-warnings',
    '--yes-playlist',
    // One extra entry reveals whether the playlist was cut off.
    '--playlist-end',
    String(options.maxEntries + 1),
  ];
  pushTargetArguments(args, options);

  const { stdout } = await runYtDlp(options.executable, args, options.timeoutMs ?? 5 * 60_000, 64 * 1024 * 1024);
  return parseYtDlpPlaylist(stdout, options.maxEntries);
}
