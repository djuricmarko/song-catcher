import type { Logger } from 'pino';

import { buildApp } from '../app.js';
import type { AppConfig } from '../config/env.js';
import { VERSION } from '../version.js';

export async function startServer(config: AppConfig, logger: Logger) {
  const { app } = await buildApp(config, logger);

  await app.listen({
    host: config.http.host,
    port: config.http.port,
  });

  logger.info(
    {
      host: config.http.host,
      port: config.http.port,
      urlPrefix: config.http.urlPrefix || '/',
      version: VERSION,
    },
    'deezer-downloader listening',
  );

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  return app;
}
