import pino, { type Logger, type LoggerOptions, type StreamEntry } from 'pino';

import type { AppConfig } from './config/env.js';

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
