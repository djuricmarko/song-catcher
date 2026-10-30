import { exec } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import type { AppConfig } from '../config/env.js';

const execAsync = promisify(exec);

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
      const contents = await readFile(config.logging.file, 'utf8');
      return contents.split(/\r?\n/).slice(-100).join('\n');
    } catch (error) {
      return `Could not read ${config.logging.file}: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  return 'No DEEZER_DEBUG_COMMAND or DEEZER_LOG_FILE is configured.';
}
