import { ArrowLeft, Download } from 'lucide-react';

import type { SearchResultDto } from '@song-catcher/shared';

import { SearchResultCard } from '../../components/SearchResultCard';
import { Button } from '../../components/ui/Button';
import type { PreviewPlayer } from '../../hooks/usePreviewPlayer';

import styles from './SearchPage.module.css';

export interface AlbumTracks {
  albumId: number;
  title: string;
  tracks: SearchResultDto[];
}

interface AlbumTracklistProps {
  album: AlbumTracks;
  /** Disables the per-track buttons while a search or download request is running. */
  busy: boolean;
  /** Disables the album button while a download request is running. */
  downloading: boolean;
  preview: PreviewPlayer;
  onBack: () => void;
  onDownloadAlbum: (albumId: number) => void;
  onDownloadTrack: (track: SearchResultDto) => void;
}

/** The songs of one album, opened from an album tile in the search results. */
export function AlbumTracklist({
  album,
  busy,
  downloading,
  preview,
  onBack,
  onDownloadAlbum,
  onDownloadTrack,
}: AlbumTracklistProps) {
  return (
    <section className={styles.resultsSection}>
      <div className={styles.sectionHeader}>
        <Button size="sm" variant="quiet" onClick={onBack}>
          <ArrowLeft size={12} aria-hidden />
          Back to results
        </Button>
      </div>
      <div className={styles.albumHead}>
        <div>
          <p className={styles.sectionLabel}>Tracklist · {album.tracks.length} songs</p>
          <h2 className={styles.albumTitle}>{album.title}</h2>
        </div>
        <Button
          disabled={downloading}
          onClick={() => {
            onDownloadAlbum(album.albumId);
          }}
        >
          <Download size={16} aria-hidden />
          Download album
        </Button>
      </div>
      <div className={styles.trackList}>
        {album.tracks.map((track, index) => (
          <SearchResultCard
            key={`album-track-${track.id}`}
            index={index}
            result={track}
            busy={busy}
            playing={preview.isPlaying(track.preview_url)}
            onTogglePreview={preview.toggleResult}
            onDownloadTrack={onDownloadTrack}
          />
        ))}
      </div>
    </section>
  );
}
