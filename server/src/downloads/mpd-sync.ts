import type { Logger } from 'pino';

import type { AppConfig } from '../config/env.js';
import { MpdClient } from '../mpd/client.js';
import { mpdRelativePath } from './paths.js';

export async function syncWithMpd(
  mpd: AppConfig['mpd'],
  files: readonly string[],
  addToPlaylist: boolean,
  logger: Logger,
): Promise<void> {
  if (!mpd.enabled) {
    return;
  }
  const musicDirRoot = mpd.musicDirRoot;
  if (!musicDirRoot) {
    logger.error('MPD is enabled, but DEEZER_MPD_MUSIC_DIR_ROOT is missing');
    return;
  }

  const client = new MpdClient(mpd.host, mpd.port, logger);
  try {
    await client.connect();
    await client.update();
    if (!addToPlaylist) {
      return;
    }

    for (const file of files) {
      let relative: string;
      try {
        relative = mpdRelativePath(musicDirRoot, file);
      } catch (error) {
        logger.error({ err: error, file }, 'cannot add file to MPD');
        continue;
      }
      if (await client.waitForFile(relative)) {
        await client.add(relative);
        logger.info({ file: relative }, 'added file to MPD playlist');
      } else {
        logger.warn({ file: relative }, 'MPD did not index file; not adding it');
      }
    }
  } catch (error) {
    logger.error({ err: error, host: mpd.host, port: mpd.port }, 'could not update MPD');
  } finally {
    client.close();
  }
}
