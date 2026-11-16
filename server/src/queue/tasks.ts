import type { Scheduler } from './scheduler.js';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- an interface does not satisfy TaskArgsMap
export type DownloadTasks = {
  download_deezer_song: { track_id: string; add_to_playlist: boolean };
  download_deezer_album: { album_id: string; add_to_playlist: boolean };
  download_deezer_playlist: { playlist_id: string; add_to_playlist: boolean };
  download_youtube: { video_url: string; add_to_playlist: boolean };
  download_youtube_playlist: { playlist_url: string; add_to_playlist: boolean };
};

export type DownloadScheduler = Scheduler<DownloadTasks>;
