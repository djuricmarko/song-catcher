import { exec } from 'node:child_process';
import { open } from 'node:fs/promises';
import { promisify } from 'node:util';

import type { AppConfig } from '../config/env.js';
import { childStderr } from '../lib/child-process.js';
import { errorMessage } from '../lib/errors.js';

export async function tailFile(file: string, lines = 100, maxBytes = 64 * 1024): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    let text = buffer.toString('utf8');
    if (length < size) {
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
    const { stdout, stderr } = await promisify(exec)(command, {
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });
    return `${stdout}${stderr}`;
  } catch (error) {
    return `Debug command failed:\n${childStderr(error) ?? errorMessage(error)}`;
  }
}

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
