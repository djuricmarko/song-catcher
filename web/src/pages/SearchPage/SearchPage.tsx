import { ArrowRight, Search } from 'lucide-react';
import { useRef, useState, type SubmitEvent } from 'react';
import { toast } from 'sonner';

import type { SearchResultDto, SearchType } from '@song-catcher/shared';

import { searchMusic, startDownload } from '../../api/client';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { Panel } from '../../components/ui/Panel';
import { Segmented } from '../../components/ui/Segmented';
import { useAppConfig } from '../../hooks/useAppConfig';
import { useEnqueue } from '../../hooks/useEnqueue';
import { usePreviewPlayer } from '../../hooks/usePreviewPlayer';
import { dismissKeyboard } from '../../lib/dismissKeyboard';
import { errorMessage } from '../../lib/errors';
import { AlbumTracklist, type AlbumTracks } from './AlbumTracklist';
import { SearchResults } from './SearchResults';

import styles from './SearchPage.module.css';

/** What the search field looks for; drill-downs into an album or artist use other search types. */
type SearchMode = 'track' | 'album' | 'artist';

const SEARCH_MODES: Array<{ value: SearchMode; label: string }> = [
  { value: 'track', label: 'Tracks' },
  { value: 'album', label: 'Albums' },
  { value: 'artist', label: 'Artists' },
];

const PLACEHOLDERS: Record<SearchMode, string> = {
  track: 'Search for a track…',
  album: 'Search for an album…',
  artist: 'Search for an artist…',
};

/** Deezer ids are positive integers; returns undefined for anything else. */
function parseDeezerId(value: string | number): number | undefined {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export function SearchPage() {
  const appConfig = useAppConfig();
  const mpdEnabled = appConfig.data?.useMpd ?? false;
  const [mode, setMode] = useState<SearchMode>('track');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultDto[]>([]);
  /** Set while the tracklist of one album is shown in place of the results. */
  const [albumTracks, setAlbumTracks] = useState<AlbumTracks | null>(null);
  const [searching, setSearching] = useState(false);
  /** True once a search has finished, so "no results" is not shown on a fresh page. */
  const [searched, setSearched] = useState(false);
  const [addToPlaylist, setAddToPlaylist] = useState(false);
  const [createZip, setCreateZip] = useState(false);
  // Incremented per search; responses from superseded searches are dropped
  // so a slow earlier request cannot overwrite newer results.
  const latestSearch = useRef(0);
  const preview = usePreviewPlayer();
  const { busy: downloading, enqueue } = useEnqueue();

  /** Runs a search and hands the results to `onFound`, unless a newer search has started meanwhile. */
  async function search(type: SearchType, searchQuery: string, onFound: (found: SearchResultDto[]) => void) {
    const searchId = ++latestSearch.current;
    const isLatest = () => searchId === latestSearch.current;

    setSearching(true);
    try {
      const found = await searchMusic(type, searchQuery);
      if (isLatest()) {
        onFound(found);
      }
    } catch (error) {
      if (isLatest()) {
        toast.error(errorMessage(error));
      }
    } finally {
      if (isLatest()) {
        setSearching(false);
      }
    }
  }

  function runSearch(type: SearchType, searchQuery: string) {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      toast.error('Enter a search query first');
      return;
    }

    void search(type, trimmed, (found) => {
      setResults(found);
      setSearched(true);
      if (found.length === 0) {
        toast.info('No results found');
      }
    });
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setAlbumTracks(null);
    dismissKeyboard();
    runSearch(mode, query);
  }

  function showAlbumTracks(result: SearchResultDto) {
    const albumId = parseDeezerId(result.album_id || result.id);
    if (albumId === undefined) {
      toast.error('This album has no valid Deezer id');
      return;
    }

    void search('album_track', String(albumId), (tracks) => {
      setAlbumTracks({
        albumId,
        title: result.album || result.title || `Album ${albumId}`,
        tracks,
      });
    });
  }

  /** Lists what belongs to an artist: their top tracks or their albums. */
  function showArtist(type: 'artist_top' | 'artist_album', result: SearchResultDto) {
    setAlbumTracks(null);
    runSearch(type, result.id);
  }

  function queueDownload(type: 'track' | 'album', musicId: number | string) {
    const id = parseDeezerId(musicId);
    if (id === undefined) {
      toast.error('This result has no valid Deezer id');
      return;
    }

    void enqueue(() => startDownload({ type, music_id: id, add_to_playlist: addToPlaylist, create_zip: createZip }), {
      successMessage: 'Download queued',
    });
  }

  const busy = searching || downloading;

  function renderResults() {
    if (albumTracks) {
      return (
        <AlbumTracklist
          album={albumTracks}
          busy={busy}
          downloading={downloading}
          preview={preview}
          onBack={() => {
            setAlbumTracks(null);
          }}
          onDownloadAlbum={(albumId) => {
            queueDownload('album', albumId);
          }}
          onDownloadTrack={(track) => {
            queueDownload('track', track.id);
          }}
        />
      );
    }
    if (results.length > 0) {
      return (
        <SearchResults
          results={results}
          busy={busy}
          preview={preview}
          onDownloadTrack={(result) => {
            queueDownload('track', result.id);
          }}
          onDownloadAlbum={(result) => {
            queueDownload('album', result.album_id || result.id);
          }}
          onShowAlbumTracks={showAlbumTracks}
          onArtistTop={(result) => {
            showArtist('artist_top', result);
          }}
          onArtistAlbums={(result) => {
            showArtist('artist_album', result);
          }}
        />
      );
    }
    if (searched && !searching) {
      return (
        <EmptyState title="Nothing on this tape">
          Try a different spelling, or switch between tracks, albums and artists.
        </EmptyState>
      );
    }
    return null;
  }

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
            placeholder={PLACEHOLDERS[mode]}
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

      {renderResults()}
    </div>
  );
}
