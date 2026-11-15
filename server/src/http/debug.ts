import { exec } from 'node:child_process';
import { open } from 'node:fs/promises';
import { promisify } from 'node:util';

import type { AppConfig } from '../config/env.js';
import { childStderr } from '../lib/child-process.js';
import { errorMessage } from '../lib/errors.js';

const execAsync = promisify(exec);

const DEBUG_COMMAND_TIMEOUT_MS = 5_000;
const DEBUG_COMMAND_MAX_BUFFER = 1024 * 1024;
const TAIL_LINES = 100;
/** Plenty for 100 log lines; avoids loading a large log file into memory. */
const TAIL_BYTES = 64 * 1024;

/** Returns the last `lines` lines of a file, reading at most `maxBytes` from its end. */
export async function tailFile(file: string, lines = TAIL_LINES, maxBytes = TAIL_BYTES): Promise<string> {
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

async function runDebugCommand(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: DEBUG_COMMAND_TIMEOUT_MS,
      maxBuffer: DEBUG_COMMAND_MAX_BUFFER,
      encoding: 'utf8',
    });
    return `${stdout}${stderr}`;
  } catch (error) {
    return `Debug command failed:\n${childStderr(error) ?? errorMessage(error)}`;
  }
}

/**
 * The text shown on the Logs page: the output of the configured debug
 * command, else the tail of the log file. Never throws; problems are
 * reported as the text itself.
 */
export async function getDebugOutput(config: AppConfig): Promise<string> {
  const { debugCommand, file } = config.logging;

  if (debugCommand) {
    return runDebugCommand(debugCommand);
  }

  if (file) {
    try {
      return await tailFile(file);
    } catch (error) {
      return `Could not read ${file}: ${errorMessage(error)}`;
    }
  }

  return 'No DEEZER_DEBUG_COMMAND or DEEZER_LOG_FILE is configured.';
}
