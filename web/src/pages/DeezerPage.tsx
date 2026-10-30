import { Download, Heart, ListMusic } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { startFavoritesDownload, startPlaylistDownload } from '../api/client';
import { useAppConfig } from '../hooks/useAppConfig';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { Input } from '../components/ui/Input';

type Tab = 'playlist' | 'favorites';

export function DeezerPage() {
  const appConfig = useAppConfig();
  const mpdEnabled = appConfig.data?.useMpd ?? false;
  const [tab, setTab] = useState<Tab>('playlist');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [userId, setUserId] = useState('');
  const [addToPlaylist, setAddToPlaylist] = useState(false);
  const [createZip, setCreateZip] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onPlaylistSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = playlistUrl.trim();
    if (!value) {
      toast.error('Enter a Deezer playlist URL or id');
      return;
    }

    setBusy(true);
    try {
      const task = await startPlaylistDownload(value, addToPlaylist, createZip);
      toast.success('Playlist download queued', { description: `Task #${task.task_id}` });
      setPlaylistUrl('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function onFavoritesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = userId.trim();
    if (!/^\d+$/.test(value)) {
      toast.error('The Deezer user id must be numeric');
      return;
    }

    setBusy(true);
    try {
      const task = await startFavoritesDownload(value, addToPlaylist, createZip);
      toast.success('Favorites download queued', { description: `Task #${task.task_id}` });
      setUserId('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h1 className="text-xl font-semibold text-zinc-900">Deezer playlists and favorites</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Download a public Deezer playlist or the favorite songs of a Deezer user. Playlists get an
        m3u8 file and can be packed into a zip archive.
      </p>

      <div className="mt-4 flex gap-1 rounded-lg bg-zinc-100 p-1">
        <button
          type="button"
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === 'playlist' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'
          }`}
          onClick={() => {
            setTab('playlist');
          }}
        >
          <ListMusic className="size-4" aria-hidden />
          Playlist
        </button>
        <button
          type="button"
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition ${
            tab === 'favorites' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'
          }`}
          onClick={() => {
            setTab('favorites');
          }}
        >
          <Heart className="size-4" aria-hidden />
          Favorites
        </button>
      </div>

      {tab === 'playlist' ? (
        <form onSubmit={onPlaylistSubmit} className="mt-4 space-y-3">
          <Input
            value={playlistUrl}
            onChange={(event) => {
              setPlaylistUrl(event.target.value);
            }}
            placeholder="https://www.deezer.com/us/playlist/… or playlist id"
            aria-label="Deezer playlist URL"
          />
          <div className="flex flex-wrap gap-4">
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
              label="Create zip"
            />
          </div>
          <Button type="submit" disabled={busy}>
            <Download className="size-4" aria-hidden />
            {busy ? 'Queueing…' : 'Download playlist'}
          </Button>
        </form>
      ) : (
        <form onSubmit={onFavoritesSubmit} className="mt-4 space-y-3">
          <Input
            value={userId}
            onChange={(event) => {
              setUserId(event.target.value);
            }}
            placeholder="Deezer user id (numbers only)"
            inputMode="numeric"
            aria-label="Deezer user id"
          />
          <div className="flex flex-wrap gap-4">
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
              label="Create zip"
            />
          </div>
          <Button type="submit" disabled={busy}>
            <Download className="size-4" aria-hidden />
            {busy ? 'Queueing…' : 'Download favorites'}
          </Button>
        </form>
      )}
    </section>
  );
}
