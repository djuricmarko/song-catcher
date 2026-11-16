import { ArrowLeft, Download } from 'lucide-react';

import type { SearchResultDto } from '@song-catcher/shared';

import { SearchResultCard } from '../../components/SearchResultCard';
import { Button } from '../../components/ui/Button';
import type { PreviewPlayer } from '../../hooks/usePreviewPlayer';

import styles from './DeezerPage.module.css';

export interface AlbumTracks {
  albumId: number;
  title: string;
  artist: string;
  tracks: SearchResultDto[];
}

interface AlbumTracklistProps {
  album: AlbumTracks;
  busy: boolean;
  downloading: boolean;
  preview: PreviewPlayer;
  onBack: () => void;
  onDownloadAlbum: (album: AlbumTracks) => void;
  onDownloadTrack: (track: SearchResultDto) => void;
}

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
    <section className={styles.results}>
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
          size="sm"
          variant="outline"
          disabled={downloading}
          onClick={() => {
            onDownloadAlbum(album);
          }}
        >
          <Download size={13} strokeWidth={1.75} aria-hidden />
          Download album
        </Button>
      </div>
      <div className={styles.list}>
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
