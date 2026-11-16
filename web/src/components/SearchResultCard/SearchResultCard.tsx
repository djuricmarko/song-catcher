import { Disc3, Download, ListMusic, Pause, Play, User } from 'lucide-react';
import type { ReactNode } from 'react';

import type { SearchResultDto } from '@song-catcher/shared';

import { cn } from '../../lib/cn';
import { formatIndex } from '../../lib/format';
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

interface RowProps {
  index: ReactNode;
  thumb: ReactNode;
  title: string;
  subtitle: ReactNode;
  actions: ReactNode;
  playing?: boolean | undefined;
}

function Row({ index, thumb, title, subtitle, actions, playing }: RowProps) {
  return (
    <div className={cn(styles.row, playing && styles.rowPlaying)}>
      <span className={styles.index}>{index}</span>
      {thumb}
      <div className={styles.meta}>
        <p className={styles.title}>{title || 'Unknown'}</p>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>
      <div className={styles.actions}>{actions}</div>
    </div>
  );
}

function GetButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" disabled={busy} aria-label={label} onClick={onClick}>
      <Download size={13} strokeWidth={1.75} aria-hidden />
      Get
    </Button>
  );
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
  switch (props.result.id_type) {
    case 'track':
      return <TrackRow {...props} />;
    case 'album':
      return <AlbumRow {...props} />;
    case 'artist':
      return <ArtistRow {...props} />;
  }
}

function TrackRow({ result, index, busy, playing, onTogglePreview, onDownloadTrack }: SearchResultCardProps) {
  return (
    <Row
      playing={playing}
      index={playing ? <Equalizer /> : formatIndex(index + 1)}
      thumb={
        <div className={styles.thumb}>
          {result.img_url ? <img src={result.img_url} alt="" loading="lazy" /> : <ListMusic size={18} aria-hidden />}
          {result.preview_url && onTogglePreview ? (
            <button
              type="button"
              className={styles.previewButton}
              aria-label={playing ? `Pause preview of ${result.title}` : `Play preview of ${result.title}`}
              onClick={() => {
                onTogglePreview(result);
              }}
            >
              {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
            </button>
          ) : null}
        </div>
      }
      title={result.title}
      subtitle={
        <>
          <span>{result.artist}</span>
          {result.album ? (
            <>
              <span className={styles.sep} aria-hidden>
                /
              </span>
              <span>{result.album}</span>
            </>
          ) : null}
        </>
      }
      actions={
        <GetButton
          label={`Get ${result.title}`}
          busy={busy}
          onClick={() => {
            onDownloadTrack(result);
          }}
        />
      }
    />
  );
}

function AlbumRow({ result, index, busy, onDownloadAlbum, onShowAlbumTracks }: SearchResultCardProps) {
  return (
    <Row
      index={formatIndex(index + 1)}
      thumb={
        <div className={styles.thumb}>
          {result.img_url ? <img src={result.img_url} alt="" loading="lazy" /> : <Disc3 size={18} aria-hidden />}
        </div>
      }
      title={result.album}
      subtitle={<span>{result.artist}</span>}
      actions={
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
          <GetButton
            label={`Get album ${result.album}`}
            busy={busy}
            onClick={() => {
              onDownloadAlbum?.(result);
            }}
          />
        </>
      }
    />
  );
}

function ArtistRow({ result, index, busy, onArtistTop, onArtistAlbums }: SearchResultCardProps) {
  return (
    <Row
      index={formatIndex(index + 1)}
      thumb={
        <div className={cn(styles.thumb, styles.thumbRound)}>
          {result.img_url ? <img src={result.img_url} alt="" loading="lazy" /> : <User size={18} aria-hidden />}
        </div>
      }
      title={result.artist}
      subtitle={<span>Artist</span>}
      actions={
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
      }
    />
  );
}
