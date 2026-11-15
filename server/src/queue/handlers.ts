import type { DownloadService } from '../downloads/service.js';
import type { DownloadScheduler } from './tasks.js';

export function registerDownloadHandlers(scheduler: DownloadScheduler, downloads: DownloadService): void {
  scheduler.register('download_deezer_song_and_queue', (args, { reportProgress }) =>
    downloads.downloadTrack(args.track_id, args.add_to_playlist, reportProgress),
  );

  scheduler.register('download_deezer_album_and_queue_and_zip', (args, { reportProgress, reportWarning }) =>
    downloads.downloadAlbum(args.album_id, args.add_to_playlist, args.create_zip, reportProgress, reportWarning),
  );

  scheduler.register('download_deezer_playlist_and_queue_and_zip', (args, { reportProgress, reportWarning }) =>
    downloads.downloadPlaylist(args.playlist_id, args.add_to_playlist, args.create_zip, reportProgress, reportWarning),
  );

  scheduler.register('download_deezer_favorites', (args, { reportProgress, reportWarning }) =>
    downloads.downloadFavorites(args.user_id, args.add_to_playlist, args.create_zip, reportProgress, reportWarning),
  );

  scheduler.register('download_youtubedl_and_queue', (args) =>
    downloads.downloadYoutube(args.video_url, args.add_to_playlist),
  );

  scheduler.register('download_youtube_playlist_and_queue_and_zip', (args, { reportProgress, reportWarning }) =>
    downloads.downloadYoutubePlaylist(
      args.playlist_url,
      args.add_to_playlist,
      args.create_zip,
      reportProgress,
      reportWarning,
    ),
  );
}
