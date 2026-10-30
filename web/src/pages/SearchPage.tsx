import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import type { SearchResultDto } from '@deezer-downloader/shared';

import { searchMusic, startDownload } from '../api/client';
import { SearchResultCard } from '../components/SearchResultCard';
import { useAppConfig } from '../hooks/useAppConfig';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';

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

  async function runSearch(
    searchType: SearchMode | 'album_track' | 'artist_top' | 'artist_album',
    searchQuery: string,
  ) {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      toast.error('Enter a search query first');
      return;
    }

    setSearching(true);
    try {
      const found = await searchMusic(searchType, trimmed);
      setResults(found);
      setSearched(true);
      if (found.length === 0) {
        toast.info('No results found');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAlbumTracks(null);
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

    setSearching(true);
    try {
      const tracks = await searchMusic('album_track', String(albumId));
      setAlbumTracks({
        albumId,
        title: result.album || result.title || `Album ${albumId}`,
        tracks,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Search Deezer</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Find tracks, albums and artists. Downloads are queued and can be followed on the Queue
          page.
        </p>

        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as SearchMode);
            }}
            className="sm:w-40"
            aria-label="Search type"
          >
            {SEARCH_MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder={
              mode === 'artist' ? 'Artist name' : mode === 'album' ? 'Album name' : 'Track name'
            }
            aria-label="Search query"
          />
          <Button type="submit" disabled={searching} className="sm:w-28">
            <Search className="size-4" aria-hidden />
            {searching ? 'Searching…' : 'Search'}
          </Button>
        </form>

        <div className="mt-3 flex flex-wrap gap-4">
          {mpdEnabled ? (
            <Checkbox
              checked={addToPlaylist}
              onChange={(event) => {
                setAddToPlaylist(event.target.checked);
              }}
              label="Add to MPD playlist"
            />
          ) : null}
          <Checkbox
            checked={createZip}
            onChange={(event) => {
              setCreateZip(event.target.checked);
            }}
            label="Create zip for albums/playlists"
          />
        </div>
      </section>

      {results.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Results</h2>
            <span className="text-xs text-zinc-400">{results.length} found</span>
          </div>
          <div className="grid gap-2">
            {results.map((result) => (
              <SearchResultCard
                key={`${result.id_type}-${result.id}`}
                result={result}
                busy={searching || downloading}
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
        <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
          No results. Try a different query or search type.
        </p>
      ) : null}

      {albumTracks ? (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-800">Tracks in “{albumTracks.title}”</h2>
            <Button
              size="sm"
              disabled={downloading}
              onClick={() => {
                void queueDownload('album', albumTracks.albumId);
              }}
            >
              Download whole album
            </Button>
          </div>
          <div className="grid gap-2">
            {albumTracks.tracks.map((track) => (
              <SearchResultCard
                key={`album-track-${track.id}`}
                result={track}
                busy={searching || downloading}
                onDownloadTrack={(item) => {
                  void queueDownload('track', item.id);
                }}
                onDownloadAlbum={() => undefined}
                onShowAlbumTracks={() => undefined}
                onArtistTop={() => undefined}
                onArtistAlbums={() => undefined}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
