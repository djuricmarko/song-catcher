import { renameSync, statSync } from 'node:fs';

import pino, { type Logger, type LoggerOptions, type StreamEntry } from 'pino';

import type { AppConfig } from './config/env.js';

/** Rotate the log file at startup once it exceeds this size. */
export const MAX_LOG_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Keeps one previous generation (`<file>.1`). Only runs at startup; use
 * logrotate for long-running instances that log heavily.
 */
export function rotateLogFile(file: string, maxBytes = MAX_LOG_FILE_BYTES): boolean {
  try {
    if (statSync(file).size <= maxBytes) {
      return false;
    }
    renameSync(file, `${file}.1`);
    return true;
  } catch {
    // Missing file or no permission: just keep appending.
    return false;
  }
}

export function createLogger(config: AppConfig): Logger {
  const options: LoggerOptions = {
    level: config.logging.level,
    redact: {
      paths: [
        'cookieArl',
        'deezer.cookieArl',
        'config.deezer.cookieArl',
        'DEEZER_COOKIE_ARL',
        '*.headers.cookie',
        'err.request.options.headers.cookie',
        'err.options.headers.cookie',
      ],
      censor: '[REDACTED]',
    },
  };

  if (!config.logging.file) {
    return pino(options);
  }
  rotateLogFile(config.logging.file);

  const streams: StreamEntry[] = [
    { level: config.logging.level, stream: process.stdout },
    {
      level: config.logging.level,
      stream: pino.destination({
        dest: config.logging.file,
        mkdir: true,
        sync: false,
      }),
    },
  ];

  return pino(options, pino.multistream(streams));
}
