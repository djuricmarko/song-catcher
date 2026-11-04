import type { Logger } from 'pino';

import type { AppConfig } from './config/env.js';
import { DeezerClient } from './deezer/client.js';
import { DownloadService } from './downloads/service.js';
import { createServer } from './http/server.js';
import { Scheduler } from './queue/scheduler.js';
import type { DownloadScheduler, DownloadTasks } from './queue/tasks.js';

/**
 * How long shutdown waits for running downloads. Kept below Docker's default
 * 10 s stop timeout so the process exits cleanly instead of being SIGKILLed.
 */
const SHUTDOWN_GRACE_MS = 8_000;

export interface BuiltApp {
  app: Awaited<ReturnType<typeof createServer>>;
  deezer: DeezerClient;
  scheduler: DownloadScheduler;
  downloads: DownloadService;
}

export async function buildApp(config: AppConfig, logger: Logger): Promise<BuiltApp> {
  const deezer = new DeezerClient(config, logger);
  await deezer.init();

  const scheduler: DownloadScheduler = new Scheduler<DownloadTasks>(
    config.queue.workers,
    config.queue.historyLimit,
    logger,
  );
  const downloads = new DownloadService(config, deezer, logger);

  scheduler.register('download_deezer_song_and_queue', async (args, context) => {
    return downloads.downloadTrack(args.track_id, args.add_to_playlist, context.reportProgress);
  });

  scheduler.register('download_deezer_album_and_queue_and_zip', async (args, context) => {
    return downloads.downloadAlbum(
      args.album_id,
      args.add_to_playlist,
      args.create_zip,
      context.reportProgress,
      context.reportWarning,
    );
  });

  scheduler.register('download_deezer_playlist_and_queue_and_zip', async (args, context) => {
    return downloads.downloadPlaylist(
      args.playlist_id,
      args.add_to_playlist,
      args.create_zip,
      context.reportProgress,
      context.reportWarning,
    );
  });

  scheduler.register('download_deezer_favorites', async (args, context) => {
    return downloads.downloadFavorites(
      args.user_id,
      args.add_to_playlist,
      args.create_zip,
      context.reportProgress,
      context.reportWarning,
    );
  });

  scheduler.register('download_youtubedl_and_queue', async (args) => {
    return downloads.downloadYoutube(args.video_url, args.add_to_playlist);
  });

  scheduler.start();

  const app = await createServer(config, logger, { deezer, scheduler, downloads });
  app.addHook('onClose', async () => {
    await scheduler.stop(SHUTDOWN_GRACE_MS);
  });

  return { app, deezer, scheduler, downloads };
}
