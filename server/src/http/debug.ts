import { exec } from 'node:child_process';
import { open } from 'node:fs/promises';
import { promisify } from 'node:util';

import type { AppConfig } from '../config/env.js';

const execAsync = promisify(exec);

const TAIL_LINES = 100;
/** Plenty for 100 log lines; avoids loading a large log file into memory. */
const TAIL_BYTES = 64 * 1024;

/** Returns the last `lines` lines of a file, reading at most `maxBytes` from its end. */
export async function tailFile(file: string, lines = TAIL_LINES, maxBytes = TAIL_BYTES) {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    let text = buffer.toString('utf8');
    if (length < size) {
      // Drop the first, probably partial, line.
      text = text.slice(text.indexOf('\n') + 1);
    }
    return text
      .replace(/\r?\n$/, '')
      .split(/\r?\n/)
      .slice(-lines)
      .join('\n');
  } finally {
    await handle.close();
  }
}

export async function getDebugOutput(config: AppConfig): Promise<string> {
  if (config.logging.debugCommand) {
    try {
      const { stdout, stderr } = await execAsync(config.logging.debugCommand, {
        timeout: 5_000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf8',
      });
      return `${stdout}${stderr}`;
    } catch (error) {
      const details =
        typeof error === 'object' && error !== null && 'stderr' in error
          ? String(error.stderr)
          : error instanceof Error
            ? error.message
            : String(error);
      return `Debug command failed:\n${details}`;
    }
  }

  if (config.logging.file) {
    try {
      return await tailFile(config.logging.file);
    } catch (error) {
      return `Could not read ${config.logging.file}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return 'No DEEZER_DEBUG_COMMAND or DEEZER_LOG_FILE is configured.';
}
