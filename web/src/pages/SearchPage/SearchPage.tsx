import { ArrowLeft, ArrowRight, Download, Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import type { SearchResultDto } from '@deezer-downloader/shared';

import { searchMusic, startDownload } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { SearchResultCard } from '../../components/SearchResultCard';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { Panel } from '../../components/ui/Panel';
import { Segmented } from '../../components/ui/Segmented';
import { useAppConfig } from '../../hooks/useAppConfig';
import { dismissKeyboard } from '../../lib/dismissKeyboard';

import styles from './SearchPage.module.css';

type SearchMode = 'track' | 'album' | 'artist';

const SEARCH_MODES: Array<{ value: SearchMode; label: string }> = [
  { value: 'track', label: 'Tracks' },
  { value: 'album', label: 'Albums' },
  { value: 'artist', label: 'Artists' },
];

interface AlbumTracks {
  albumId: number;
  title: string;
  tracks: SearchResultDto[];
}

export function SearchPage() {
  const appConfig = useAppConfig();
  const mpdEnabled = appConfig.data?.useMpd ?? false;
  const [mode, setMode] = useState<SearchMode>('track');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultDto[]>([]);
  const [albumTracks, setAlbumTracks] = useState<AlbumTracks | null>(null);
  const [searching, setSearching] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [addToPlaylist, setAddToPlaylist] = useState(false);
  const [createZip, setCreateZip] = useState(false);
  const [searched, setSearched] = useState(false);
  // Incremented per search; responses from superseded searches are dropped
  // so a slow earlier request cannot overwrite newer results.
  const latestSearch = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function togglePreview(result: SearchResultDto) {
    if (!result.preview_url) {
      return;
    }
    if (!audioRef.current) {
      const audio = new Audio();
      audio.addEventListener('ended', () => {
        setPlayingUrl(null);
      });
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    if (playingUrl === result.preview_url) {
      audio.pause();
      setPlayingUrl(null);
      return;
    }
    audio.src = result.preview_url;
    void audio.play().catch(() => {
      setPlayingUrl(null);
      toast.error('Could not play the preview');
    });
    setPlayingUrl(result.preview_url);
  }

  async function runSearch(
    searchType: SearchMode | 'album_track' | 'artist_top' | 'artist_album',
    searchQuery: string,
  ) {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      toast.error('Enter a search query first');
      return;
    }

    const searchId = ++latestSearch.current;
    setSearching(true);
    try {
      const found = await searchMusic(searchType, trimmed);
      if (searchId !== latestSearch.current) {
        return;
      }
      setResults(found);
      setSearched(true);
      if (found.length === 0) {
        toast.info('No results found');
      }
    } catch (error) {
      if (searchId === latestSearch.current) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (searchId === latestSearch.current) {
        setSearching(false);
      }
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAlbumTracks(null);
    dismissKeyboard();
    void runSearch(mode, query);
  }

  async function queueDownload(type: 'track' | 'album', musicId: number | string) {
    const numericId = Number(musicId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      toast.error('This result has no valid Deezer id');
      return;
    }

    setDownloading(true);
    try {
      const task = await startDownload({
        type,
        music_id: numericId,
        add_to_playlist: addToPlaylist,
        create_zip: createZip,
      });
      toast.success('Download queued', { description: `Task #${task.task_id}` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setDownloading(false);
    }
  }

  async function showAlbumTracks(result: SearchResultDto) {
    const albumId = Number(result.album_id || result.id);
    if (!Number.isInteger(albumId) || albumId <= 0) {
      toast.error('This album has no valid Deezer id');
      return;
    }

    const searchId = ++latestSearch.current;
    setSearching(true);
    try {
      const tracks = await searchMusic('album_track', String(albumId));
      if (searchId !== latestSearch.current) {
        return;
      }
      setAlbumTracks({
        albumId,
        title: result.album || result.title || `Album ${albumId}`,
        tracks,
      });
    } catch (error) {
      if (searchId === latestSearch.current) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (searchId === latestSearch.current) {
        setSearching(false);
      }
    }
  }

  const busy = searching || downloading;
  const tileResults = results.length > 0 && results[0]?.id_type !== 'track';

  return (
    <div className={styles.page}>
      <PageHeader
        index="01"
        eyebrow="Search"
        title={
          <>
            Find something <em>worth keeping</em>
          </>
        }
        description="Search the Deezer catalogue for tracks, albums and artists. Everything you grab lands in the queue."
      />

      <Panel as="form" onSubmit={onSubmit} className={styles.searchPanel}>
        <div className={styles.modeRow}>
          <Segmented aria-label="Search type" value={mode} onValueChange={setMode} options={SEARCH_MODES} />
        </div>
        <div className={styles.searchRow}>
          <Input
            size="lg"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            leading={<Search size={18} aria-hidden />}
            trailing={<kbd className={styles.kbd}>Ctrl M</kbd>}
            placeholder={
              mode === 'artist'
                ? 'Search for an artist…'
                : mode === 'album'
                  ? 'Search for an album…'
                  : 'Search for a track…'
            }
            aria-label="Search query"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <Button type="submit" size="lg" disabled={searching} className={styles.submit}>
            {searching ? 'Searching…' : 'Search'}
            <ArrowRight size={16} aria-hidden />
          </Button>
        </div>
        <div className={styles.options}>
          {mpdEnabled ? (
            <Checkbox checked={addToPlaylist} onCheckedChange={setAddToPlaylist} label="Add to MPD playlist" />
          ) : null}
          <Checkbox checked={createZip} onCheckedChange={setCreateZip} label="Zip albums" />
        </div>
      </Panel>

      {albumTracks ? (
        <section className={styles.resultsSection}>
          <div className={styles.sectionHeader}>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => {
                setAlbumTracks(null);
              }}
            >
              <ArrowLeft size={12} aria-hidden />
              Back to results
            </Button>
          </div>
          <div className={styles.albumHead}>
            <div>
              <p className={styles.sectionLabel}>Tracklist · {albumTracks.tracks.length} songs</p>
              <h2 className={styles.albumTitle}>{albumTracks.title}</h2>
            </div>
            <Button
              disabled={downloading}
              onClick={() => {
                void queueDownload('album', albumTracks.albumId);
              }}
            >
              <Download size={16} aria-hidden />
              Download album
            </Button>
          </div>
          <div className={styles.trackList}>
            {albumTracks.tracks.map((track, index) => (
              <SearchResultCard
                key={`album-track-${track.id}`}
                index={index}
                result={track}
                busy={busy}
                playing={playingUrl !== null && playingUrl === track.preview_url}
                onTogglePreview={togglePreview}
                onDownloadTrack={(item) => {
                  void queueDownload('track', item.id);
                }}
              />
            ))}
          </div>
        </section>
      ) : results.length > 0 ? (
        <section className={styles.resultsSection}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionLabel}>Results</p>
            <span className={styles.sectionRule} aria-hidden />
            <p className={styles.sectionLabel}>{results.length} found</p>
          </div>
          <div className={tileResults ? styles.tileGrid : styles.trackList}>
            {results.map((result, index) => (
              <SearchResultCard
                key={`${result.id_type}-${result.id}`}
                index={index}
                result={result}
                busy={busy}
                playing={playingUrl !== null && playingUrl === result.preview_url}
                onTogglePreview={togglePreview}
                onDownloadTrack={(item) => {
                  void queueDownload('track', item.id);
                }}
                onDownloadAlbum={(item) => {
                  void queueDownload('album', item.album_id || item.id);
                }}
                onShowAlbumTracks={(item) => {
                  void showAlbumTracks(item);
                }}
                onArtistTop={(item) => {
                  setAlbumTracks(null);
                  void runSearch('artist_top', item.id);
                }}
                onArtistAlbums={(item) => {
                  setAlbumTracks(null);
                  void runSearch('artist_album', item.id);
                }}
              />
            ))}
          </div>
        </section>
      ) : searched && !searching ? (
        <EmptyState title="Nothing on this tape">
          Try a different spelling, or switch between tracks, albums and artists.
        </EmptyState>
      ) : null}
    </div>
  );
}
