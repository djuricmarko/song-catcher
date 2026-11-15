import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';

export async function isNonEmptyFile(filename: string): Promise<boolean> {
  try {
    const info = await stat(filename);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

export function temporaryPathFor(target: string): string {
  return `${target}.${randomUUID()}.part`;
}

export async function removeQuietly(filename: string): Promise<void> {
  await rm(filename, { force: true }).catch(() => undefined);
}
