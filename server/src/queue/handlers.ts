import type { DownloadService } from '../downloads/service.js';
import type { DownloadScheduler } from './tasks.js';

export function registerDownloadHandlers(scheduler: DownloadScheduler, downloads: DownloadService): void {
  scheduler.register('download_deezer_song', (args, context) =>
    downloads.downloadTrack(args.track_id, args.add_to_playlist, context),
  );

  scheduler.register('download_deezer_album', (args, context) =>
    downloads.downloadAlbum(args.album_id, args.add_to_playlist, context),
  );

  scheduler.register('download_deezer_playlist', (args, context) =>
    downloads.downloadPlaylist(args.playlist_id, args.add_to_playlist, context),
  );

  scheduler.register('download_youtube', (args, context) =>
    downloads.downloadYoutube(args.video_url, args.add_to_playlist, context),
  );

  scheduler.register('download_youtube_playlist', (args, context) =>
    downloads.downloadYoutubePlaylist(args.playlist_url, args.add_to_playlist, context),
  );
}
