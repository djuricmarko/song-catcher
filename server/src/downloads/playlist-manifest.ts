import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { removeQuietly, temporaryPathFor } from '../lib/files.js';

/**
 * Remembers which playlist entry produced which file, so downloading the
 * same playlist again only fetches new songs. yt-dlp names files after the
 * video title, which is not known before downloading.
 */
export const YOUTUBE_PLAYLIST_MANIFEST = '.playlist.json';

/** Maps the id of a playlist entry to the name of its file inside the playlist folder. */
export type PlaylistManifest = Record<string, string>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only plain file names, so a tampered manifest cannot point outside the directory. */
function isPlainFilename(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && path.basename(value) === value;
}

/** Reads the manifest of a playlist folder. A missing or damaged one counts as empty. */
export async function readPlaylistManifest(directory: string): Promise<PlaylistManifest> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path.join(directory, YOUTUBE_PLAYLIST_MANIFEST), 'utf8'));
  } catch {
    // Every song is downloaded again and the file rewritten.
    return {};
  }

  const manifest: PlaylistManifest = {};
  if (isPlainObject(parsed)) {
    for (const [id, filename] of Object.entries(parsed)) {
      if (isPlainFilename(filename)) {
        manifest[id] = filename;
      }
    }
  }
  return manifest;
}

export async function writePlaylistManifest(directory: string, manifest: PlaylistManifest): Promise<void> {
  const target = path.join(directory, YOUTUBE_PLAYLIST_MANIFEST);
  const temporary = temporaryPathFor(target);
  try {
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
  } catch (error) {
    await removeQuietly(temporary);
    throw error;
  }
}
