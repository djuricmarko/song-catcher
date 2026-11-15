import { createWriteStream } from 'node:fs';
import { rename } from 'node:fs/promises';
import path from 'node:path';

import archiver from 'archiver';

import { removeQuietly, temporaryPathFor } from '../lib/files.js';

/**
 * Packs `files` into `zipPath`, all inside one top-level `folderName`.
 *
 * The archive is written to a temporary file and renamed, so a concurrent job
 * or a user downloading the previous zip never sees a half-written archive.
 */
export async function writeZipArchive(zipPath: string, folderName: string, files: readonly string[]): Promise<void> {
  const temporaryZip = temporaryPathFor(zipPath);
  const output = createWriteStream(temporaryZip);
  // MP3/FLAC are already compressed; deflating them only burns CPU.
  const archive = archiver('zip', { store: true });

  const written = new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });

  archive.pipe(output);
  for (const file of files) {
    archive.file(file, { name: `${folderName}/${path.basename(file)}` });
  }

  try {
    await archive.finalize();
    await written;
    await rename(temporaryZip, zipPath);
  } catch (error) {
    await removeQuietly(temporaryZip);
    throw error;
  }
}
