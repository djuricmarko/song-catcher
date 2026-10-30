import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function childEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.DEEZER_COOKIE_ARL;
  return env;
}

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
}

export function parseYtDlpOutput(stdout: string): string | undefined {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line && line.endsWith('.mp3') && (line.startsWith('/') || /^[A-Za-z]:\\/.test(line))) {
      return line;
    }
  }

  const destination = /Destination:\s(.*\.mp3)/.exec(stdout);
  return destination?.[1]?.trim();
}

export async function downloadWithYtDlp(options: YoutubeDlOptions): Promise<string> {
  const outputTemplate = path.join(options.destinationDirectory, '%(title)s.%(ext)s');
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
  ];

  const ffmpegPath = options.ffmpegPath?.trim();
  if (ffmpegPath && (path.isAbsolute(ffmpegPath) || ffmpegPath.includes(path.sep))) {
    args.push('--ffmpeg-location', ffmpegPath);
  }

  const proxyUrl = options.proxyUrl?.trim();
  if (proxyUrl) {
    args.push('--proxy', proxyUrl);
  }
  args.push(options.url);

  let stdout: string;
  let stderr: string;
  try {
    const result = await execFileAsync(options.executable, args, {
      maxBuffer: 16 * 1024 * 1024,
      env: childEnvironment(),
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const details =
      typeof error === 'object' && error !== null && 'stderr' in error
        ? String(error.stderr)
        : error instanceof Error
          ? error.message
          : String(error);
    throw new YoutubeDlError(`yt-dlp failed. You may have to update it.\n${details}`, {
      cause: error,
    });
  }

  const filename = parseYtDlpOutput(stdout);
  if (!filename) {
    throw new YoutubeDlError(
      `Could not extract the output file from yt-dlp.\nstdout: ${stdout}\nstderr: ${stderr}`,
    );
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
