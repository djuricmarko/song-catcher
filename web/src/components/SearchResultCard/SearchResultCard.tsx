import { Disc3, Download, ListMusic, Pause, Play, User } from 'lucide-react';

import type { SearchResultDto } from '@deezer-downloader/shared';

import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';

import styles from './SearchResultCard.module.css';

interface SearchResultCardProps {
  result: SearchResultDto;
  index: number;
  busy: boolean;
  playing?: boolean;
  onTogglePreview?: (result: SearchResultDto) => void;
  onDownloadTrack: (result: SearchResultDto) => void;
  onDownloadAlbum?: (result: SearchResultDto) => void;
  onShowAlbumTracks?: (result: SearchResultDto) => void;
  onArtistTop?: (result: SearchResultDto) => void;
  onArtistAlbums?: (result: SearchResultDto) => void;
}

function Equalizer() {
  return (
    <span className={styles.eq} aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

export function SearchResultCard(props: SearchResultCardProps) {
  const { result } = props;
  if (result.id_type === 'track') {
    return <TrackRow {...props} />;
  }
  return <Tile {...props} />;
}

function TrackRow({ result, index, busy, playing, onTogglePreview, onDownloadTrack }: SearchResultCardProps) {
  const canPreview = Boolean(result.preview_url && onTogglePreview);

  return (
    <div className={cn(styles.row, playing && styles.rowPlaying)}>
      <span className={styles.index}>{playing ? <Equalizer /> : String(index + 1).padStart(2, '0')}</span>

      <div className={styles.thumb}>
        {result.img_url ? (
          <img src={result.img_url} alt="" loading="lazy" />
        ) : (
          <ListMusic size={18} aria-hidden className={styles.thumbFallback} />
        )}
        {canPreview ? (
          <button
            type="button"
            className={styles.previewButton}
            aria-label={playing ? `Pause preview of ${result.title}` : `Play preview of ${result.title}`}
            onClick={() => {
              onTogglePreview?.(result);
            }}
          >
            {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
        ) : null}
      </div>

      <div className={styles.meta}>
        <p className={styles.title}>{result.title || 'Unknown'}</p>
        <p className={styles.subtitle}>
          <span>{result.artist}</span>
          {result.album ? (
            <>
              <span className={styles.sep} aria-hidden>
                /
              </span>
              <span className={styles.album}>{result.album}</span>
            </>
          ) : null}
        </p>
      </div>

      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        className={styles.rowAction}
        onClick={() => {
          onDownloadTrack(result);
        }}
      >
        <Download size={14} aria-hidden />
        <span className={styles.rowActionLabel}>Get</span>
      </Button>
    </div>
  );
}

function Tile({
  result,
  busy,
  onDownloadAlbum,
  onShowAlbumTracks,
  onArtistTop,
  onArtistAlbums,
}: SearchResultCardProps) {
  const isAlbum = result.id_type === 'album';
  const title = isAlbum ? result.album : result.artist;

  return (
    <article className={cn(styles.tile, !isAlbum && styles.tileArtist)}>
      <div className={styles.art}>
        {result.img_url ? (
          <img src={result.img_url} alt="" loading="lazy" />
        ) : (
          <span className={styles.artFallback}>
            {isAlbum ? <Disc3 size={32} aria-hidden /> : <User size={32} aria-hidden />}
          </span>
        )}
        {isAlbum ? <span className={styles.vinyl} aria-hidden /> : null}
      </div>

      <div className={styles.tileBody}>
        <p className={styles.kind}>{isAlbum ? 'Album' : 'Artist'}</p>
        <p className={styles.tileTitle}>{title || 'Unknown'}</p>
        {isAlbum && result.artist ? <p className={styles.tileSubtitle}>{result.artist}</p> : null}
      </div>

      <div className={styles.tileActions}>
        {isAlbum ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                onShowAlbumTracks?.(result);
              }}
            >
              Tracks
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                onDownloadAlbum?.(result);
              }}
            >
              <Download size={14} aria-hidden />
              Album
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                onArtistTop?.(result);
              }}
            >
              Top tracks
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                onArtistAlbums?.(result);
              }}
            >
              Albums
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
