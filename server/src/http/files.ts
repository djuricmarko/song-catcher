import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import type { FileEntry, FilesResponse } from '@song-catcher/shared';

import { isPathInside, toPosixPath } from '../lib/paths.js';

/** A listing request that is refused; `statusCode` is the HTTP status to answer with. */
export class FileAccessError extends Error {
  public constructor(
    message: string,
    public readonly statusCode: 400 | 403 | 404,
  ) {
    super(message);
    this.name = 'FileAccessError';
  }
}

/**
 * Lists one directory below `baseDirectory`. `requestedPath` is relative to
 * it and comes straight from the client, so it is checked twice: as written,
 * and again after resolving symlinks.
 *
 * Directories come first, then files, each sorted by name.
 */
export async function listFiles(baseDirectory: string, requestedPath: string): Promise<FilesResponse> {
  if (requestedPath.includes('\0')) {
    throw new FileAccessError('invalid path', 400);
  }

  const resolvedBase = await realpath(baseDirectory);
  const normalizedRequest = requestedPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const requested = path.resolve(resolvedBase, normalizedRequest || '.');

  if (!isPathInside(resolvedBase, requested)) {
    throw new FileAccessError('path escapes the download directory', 403);
  }

  let target: string;
  try {
    target = await realpath(requested);
  } catch {
    throw new FileAccessError('path does not exist', 404);
  }

  if (!isPathInside(resolvedBase, target)) {
    throw new FileAccessError('path escapes the download directory', 403);
  }

  const info = await stat(target);
  if (!info.isDirectory()) {
    throw new FileAccessError('path is not a directory', 400);
  }

  const entries: FileEntry[] = [];
  if (target !== resolvedBase) {
    const parent = path.dirname(target);
    entries.push({
      name: '..',
      path: toPosixPath(path.relative(resolvedBase, parent)),
      isDirectory: true,
      size: 0,
    });
  }

  const directoryEntries = await readdir(target, { withFileTypes: true });
  for (const entry of directoryEntries) {
    // Dotfiles are bookkeeping (e.g. the YouTube playlist manifest), not music.
    if (entry.name.startsWith('.')) {
      continue;
    }
    const absolute = path.join(target, entry.name);
    let size = 0;
    let isDirectory = entry.isDirectory();
    try {
      const entryInfo = await stat(absolute);
      size = entryInfo.size;
      isDirectory = entryInfo.isDirectory();
    } catch {
      // Keep the Dirent information for broken symlinks.
    }
    entries.push({
      name: entry.name,
      path: toPosixPath(path.relative(resolvedBase, absolute)),
      isDirectory,
      size,
    });
  }

  entries.sort((first, second) => {
    if (first.isDirectory !== second.isDirectory) {
      return first.isDirectory ? -1 : 1;
    }
    return first.name.localeCompare(second.name, undefined, { sensitivity: 'base' });
  });

  return {
    path: toPosixPath(path.relative(resolvedBase, target)),
    entries,
  };
}
