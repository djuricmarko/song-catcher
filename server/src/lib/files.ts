import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';

/** True for a regular file with content; an empty file is a failed download, not a finished one. */
export async function isNonEmptyFile(filename: string): Promise<boolean> {
  try {
    const info = await stat(filename);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

/**
 * A unique sibling of `target` to write to before renaming it into place, so
 * nobody ever sees a half-written file under the final name.
 */
export function temporaryPathFor(target: string): string {
  return `${target}.${randomUUID()}.part`;
}

/** Deletes a file, ignoring that it may not exist or cannot be removed. */
export async function removeQuietly(filename: string): Promise<void> {
  await rm(filename, { force: true }).catch(() => undefined);
}
