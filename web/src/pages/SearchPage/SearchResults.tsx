import type { SearchResultDto } from '@song-catcher/shared';

import { SearchResultCard } from '../../components/SearchResultCard';
import type { PreviewPlayer } from '../../hooks/usePreviewPlayer';

import styles from './SearchPage.module.css';

interface SearchResultsProps {
  results: SearchResultDto[];
  busy: boolean;
  preview: PreviewPlayer;
  onDownloadTrack: (result: SearchResultDto) => void;
  onDownloadAlbum: (result: SearchResultDto) => void;
  onShowAlbumTracks: (result: SearchResultDto) => void;
  onArtistTop: (result: SearchResultDto) => void;
  onArtistAlbums: (result: SearchResultDto) => void;
}

export function SearchResults({ results, busy, preview, ...actions }: SearchResultsProps) {
  const showsTiles = results[0]?.id_type !== 'track';

  return (
    <section className={styles.resultsSection}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionLabel}>Results</p>
        <span className={styles.sectionRule} aria-hidden />
        <p className={styles.sectionLabel}>{results.length} found</p>
      </div>
      <div className={showsTiles ? styles.tileGrid : styles.trackList}>
        {results.map((result, index) => (
          <SearchResultCard
            key={`${result.id_type}-${result.id}`}
            index={index}
            result={result}
            busy={busy}
            playing={preview.isPlaying(result.preview_url)}
            onTogglePreview={preview.toggleResult}
            {...actions}
          />
        ))}
      </div>
    </section>
  );
}
