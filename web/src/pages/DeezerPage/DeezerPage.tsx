import { useRef, useState } from 'react';
import { toast } from 'sonner';

import type { DownloadRequest, SearchResultDto, SearchType } from '@song-catcher/shared';

import { searchMusic, startDownload, startPlaylistDownload } from '../../api/client';
import { Composer, ComposerStage } from '../../components/Composer';
import { EmptyState } from '../../components/EmptyState';
import { Select, type SelectOption } from '../../components/ui/Select';
import { ToggleChip } from '../../components/ui/ToggleChip';
import { useAppConfig } from '../../hooks/useAppConfig';
import { useEnqueue } from '../../hooks/useEnqueue';
import { usePreviewPlayer } from '../../hooks/usePreviewPlayer';
import { errorMessage } from '../../lib/errors';
import { AlbumTracklist, type AlbumTracks } from './AlbumTracklist';
import { SearchResults } from './SearchResults';

import styles from './DeezerPage.module.css';

type Mode = 'artist' | 'album' | 'track' | 'playlist';

const MODES: Array<SelectOption<Mode>> = [
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
  { value: 'track', label: 'Tracks' },
  { value: 'playlist', label: 'Playlist' },
];

function parseDeezerId(value: string | number): number | undefined {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function trackLabel(track: SearchResultDto): Pick<DownloadRequest, 'title' | 'subtitle'> {
  return {
    title: [track.artist, track.title].filter(Boolean).join(' - ') || undefined,
    subtitle: track.album || undefined,
  };
}

export function DeezerPage() {
  const mpdEnabled = useAppConfig().data?.useMpd ?? false;
  const [mode, setMode] = useState<Mode>('track');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultDto[]>([]);
  const [albumTracks, setAlbumTracks] = useState<AlbumTracks | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [addToPlaylist, setAddToPlaylist] = useState(false);
  const latestSearch = useRef(0);
  const preview = usePreviewPlayer();
  const { busy: downloading, enqueue } = useEnqueue();

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

  function changeMode(next: Mode) {
    latestSearch.current += 1;
    setMode(next);
    setResults([]);
    setAlbumTracks(null);
    setSearched(false);
    setSearching(false);
  }

  function submit() {
    if (mode !== 'playlist') {
      setAlbumTracks(null);
      runSearch(mode, query);
      return;
    }

    const playlist = query.trim();
    if (!playlist) {
      toast.error('Enter a Deezer playlist link or id');
      return;
    }
    void enqueue(() => startPlaylistDownload(playlist, addToPlaylist), {
      successMessage: 'Playlist download queued',
      onQueued: () => {
        setQuery('');
      },
    });
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
        artist: result.artist,
        tracks,
      });
    });
  }

  function showArtist(type: 'artist_top' | 'artist_album', result: SearchResultDto) {
    setAlbumTracks(null);
    runSearch(type, result.id);
  }

  function queueDownload(
    type: DownloadRequest['type'],
    musicId: number | string,
    label: Pick<DownloadRequest, 'title' | 'subtitle'>,
  ) {
    const id = parseDeezerId(musicId);
    if (id === undefined) {
      toast.error('This result has no valid Deezer id');
      return;
    }

    void enqueue(() => startDownload({ type, music_id: id, add_to_playlist: addToPlaylist, ...label }), {
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
          onDownloadAlbum={(album) => {
            queueDownload('album', album.albumId, { title: album.title, subtitle: album.artist || undefined });
          }}
          onDownloadTrack={(track) => {
            queueDownload('track', track.id, trackLabel(track));
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
            queueDownload('track', result.id, trackLabel(result));
          }}
          onDownloadAlbum={(result) => {
            queueDownload('album', result.album_id || result.id, {
              title: result.album || undefined,
              subtitle: result.artist || undefined,
            });
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
        <div className={styles.empty}>
          <EmptyState title="Nothing on this tape">
            Try a different spelling, or switch between tracks, albums and artists.
          </EmptyState>
        </div>
      );
    }
    return null;
  }

  const content = renderResults();

  return (
    <ComposerStage raised={content !== null}>
      <Composer
        value={query}
        onValueChange={setQuery}
        onSubmit={submit}
        busy={mode === 'playlist' ? downloading : searching}
        placeholder={mode === 'playlist' ? 'Paste a Deezer playlist link' : 'Search'}
        inputLabel={mode === 'playlist' ? 'Deezer playlist link' : 'Search query'}
        submitLabel={mode === 'playlist' ? 'Download playlist' : 'Search'}
        footer={
          <>
            <Select aria-label="Search type" value={mode} onValueChange={changeMode} options={MODES} />
            {mpdEnabled ? (
              <ToggleChip pressed={addToPlaylist} onPressedChange={setAddToPlaylist} label="Add to MPD playlist" />
            ) : null}
          </>
        }
      />
      {content}
    </ComposerStage>
  );
}
