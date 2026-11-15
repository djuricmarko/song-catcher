import type { Logger } from 'pino';

import type { AppConfig } from './config/env.js';
import { DeezerClient } from './deezer/client.js';
import { DownloadService } from './downloads/service.js';
import { createServer } from './http/server.js';
import { registerDownloadHandlers } from './queue/handlers.js';
import { Scheduler } from './queue/scheduler.js';
import type { DownloadScheduler, DownloadTasks } from './queue/tasks.js';

export interface BuiltApp {
  app: Awaited<ReturnType<typeof createServer>>;
  deezer: DeezerClient;
  scheduler: DownloadScheduler;
  downloads: DownloadService;
}

export async function buildApp(config: AppConfig, logger: Logger, webRoot?: string): Promise<BuiltApp> {
  const deezer = new DeezerClient(config, logger);
  await deezer.init();

  const downloads = new DownloadService(config, deezer, logger);
  const scheduler: DownloadScheduler = new Scheduler<DownloadTasks>(
    config.queue.workers,
    config.queue.historyLimit,
    logger,
  );
  registerDownloadHandlers(scheduler, downloads);
  scheduler.start();

  const app = await createServer(config, logger, { deezer, scheduler, downloads }, webRoot);
  app.addHook('onClose', async () => {
    // Below Docker's default 10 s stop timeout, so the process exits cleanly instead of being SIGKILLed.
    await scheduler.stop(8_000);
  });

  return { app, deezer, scheduler, downloads };
}
