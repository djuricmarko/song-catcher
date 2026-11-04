import type { Scheduler } from './scheduler.js';

/**
 * Argument shape of every task the server can enqueue. A type alias (not an
 * interface) so it satisfies `TaskArgsMap` without an index signature, which
 * would otherwise let misspelled handler names compile.
 */
export type DownloadTasks = {
  download_deezer_song_and_queue: { track_id: string; add_to_playlist: boolean };
  download_deezer_album_and_queue_and_zip: {
    album_id: string;
    add_to_playlist: boolean;
    create_zip: boolean;
  };
  download_deezer_playlist_and_queue_and_zip: {
    playlist_id: string;
    add_to_playlist: boolean;
    create_zip: boolean;
  };
  download_deezer_favorites: { user_id: string; add_to_playlist: boolean; create_zip: boolean };
  download_youtubedl_and_queue: { video_url: string; add_to_playlist: boolean };
};

export type DownloadScheduler = Scheduler<DownloadTasks>;
