import { accessSync, constants as fsConstants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { errorMessage } from '../lib/errors.js';
import type { AppConfig } from './env.js';

export type ToolName = 'ytDlp' | 'ffmpeg' | 'metaflac';

/** What `checkEnvironment` found. Errors must stop the server; warnings only limit what it can do. */
export interface EnvironmentReport {
  errors: string[];
  warnings: string[];
  /** The resolved executable of each external tool, or undefined when it is missing. */
  tools: Record<ToolName, string | undefined>;
  /** The download directories that were created or found. */
  directories: string[];
}

interface ToolRequirement {
  tool: ToolName;
  /** The environment variable that configures it, for the message. */
  variable: string;
  command: string;
  /** A missing required tool is an error; a missing optional one a warning. */
  required: boolean;
  /** What stops working without the tool. */
  consequence: string;
}

export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
}

/**
 * Finds an executable the way a shell would: a path is used as it is, a bare
 * name is searched on PATH. Returns undefined when nothing executable is found.
 */
export function resolveExecutable(command: string, envPath: string = process.env.PATH ?? ''): string | undefined {
  const trimmed = command.trim();
  if (!trimmed) {
    return undefined;
  }

  const isPath = trimmed.includes('/') || trimmed.includes('\\');
  const candidates = isPath
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

function toolRequirements(config: AppConfig): ToolRequirement[] {
  // Only metaflac is essential, and only for FLAC; the others merely disable
  // YouTube downloads, so they should not stop the server from starting.
  return [
    {
      tool: 'ytDlp',
      variable: 'DEEZER_YTDLP_PATH',
      command: config.tools.ytdlpPath,
      required: false,
      consequence: 'YouTube downloads will fail',
    },
    {
      tool: 'ffmpeg',
      variable: 'DEEZER_FFMPEG_PATH',
      command: config.tools.ffmpegPath,
      required: false,
      consequence: 'YouTube audio extraction will fail',
    },
    {
      tool: 'metaflac',
      variable: 'DEEZER_METAFLAC_PATH',
      command: config.tools.metaflacPath,
      required: config.deezer.quality === 'flac',
      consequence: 'FLAC files cannot be tagged',
    },
  ];
}

/**
 * Filesystem and executable checks performed at startup and by `--check`:
 * finds the external tools, creates the download directories and warns about
 * an unprotected public listen address.
 */
export async function checkEnvironment(config: AppConfig): Promise<EnvironmentReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tools: Record<ToolName, string | undefined> = {
    ytDlp: resolveExecutable(config.tools.ytdlpPath),
    ffmpeg: resolveExecutable(config.tools.ffmpegPath),
    metaflac: resolveExecutable(config.tools.metaflacPath),
  };

  for (const { tool, variable, command, required, consequence } of toolRequirements(config)) {
    if (tools[tool]) {
      continue;
    }
    if (required) {
      errors.push(`${variable}: executable not found: ${command}`);
    } else {
      warnings.push(`${variable}: executable not found: ${command} (${consequence})`);
    }
  }

  // Overrides may point several settings at the same directory.
  const directories = [...new Set(Object.values(config.downloads))];
  for (const directory of directories) {
    try {
      await mkdir(directory, { recursive: true });
      await access(directory, fsConstants.W_OK);
    } catch (error) {
      errors.push(`cannot create or write directory ${directory}: ${errorMessage(error)}`);
    }
  }

  if (!config.http.auth && !isLoopbackHost(config.http.host)) {
    warnings.push(
      `listening on ${config.http.host} without authentication; anyone who can reach this port can ` +
        'start downloads and read logs. Set DEEZER_AUTH_USER and DEEZER_AUTH_PASSWORD.',
    );
  }

  return { errors, warnings, tools, directories };
}
