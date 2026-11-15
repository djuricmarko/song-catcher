import { existsSync } from 'node:fs';
import path from 'node:path';

import type { ToolName, ToolPaths } from './settings.js';

export function executableName(tool: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? `${tool}.exe` : tool;
}

export function builderPlatform(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') {
    return 'mac';
  }
  return platform === 'win32' ? 'win' : platform;
}

export function searchDirectories(envPath: string | undefined, platform: NodeJS.Platform = process.platform): string[] {
  const inherited = (envPath ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean);
  const desktopSessionsMiss = platform === 'win32' ? [] : ['/usr/local/bin', '/opt/homebrew/bin'];
  return [...new Set([...inherited, ...desktopSessionsMiss])];
}

export function locateTools(directories: string[], platform: NodeJS.Platform = process.platform): ToolPaths {
  const locate = (tool: ToolName) =>
    directories.map((directory) => path.join(directory, executableName(tool, platform))).find(existsSync);

  return { 'yt-dlp': locate('yt-dlp'), ffmpeg: locate('ffmpeg'), metaflac: locate('metaflac') };
}
