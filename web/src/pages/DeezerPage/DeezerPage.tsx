import { Tabs } from '@base-ui/react/tabs';
import { ArrowRight, Heart, ListMusic } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { startFavoritesDownload, startPlaylistDownload } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { Panel } from '../../components/ui/Panel';
import { useAppConfig } from '../../hooks/useAppConfig';

import styles from './DeezerPage.module.css';

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

  const options = (
    <div className={styles.options}>
      {mpdEnabled ? (
        <Checkbox checked={addToPlaylist} onCheckedChange={setAddToPlaylist} label="Add to MPD playlist" />
      ) : null}
      <Checkbox
        checked={createZip}
        onCheckedChange={setCreateZip}
        label="Pack into a zip"
        hint="One archive with every song and the m3u8"
      />
    </div>
  );

  return (
    <div>
      <PageHeader
        index="03"
        eyebrow="Playlists"
        title={
          <>
            Bring the <em>whole crate</em>
          </>
        }
        description="Download a public Deezer playlist, or every song a user has hearted. Playlists come with an m3u8 file."
      />

      <Tabs.Root
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
        }}
      >
        <Tabs.List className={styles.tabList}>
          <Tabs.Tab value="playlist" className={styles.tab}>
            <ListMusic size={16} aria-hidden />
            Playlist
          </Tabs.Tab>
          <Tabs.Tab value="favorites" className={styles.tab}>
            <Heart size={16} aria-hidden />
            Favorites
          </Tabs.Tab>
          <Tabs.Indicator className={styles.indicator} />
        </Tabs.List>

        <Panel className={styles.panel}>
          <Tabs.Panel value="playlist">
            <form onSubmit={onPlaylistSubmit} className={styles.form}>
              <label className={styles.fieldLabel} htmlFor="playlist-url">
                Playlist link or id
              </label>
              <div className={styles.row}>
                <Input
                  id="playlist-url"
                  size="lg"
                  value={playlistUrl}
                  onChange={(event) => {
                    setPlaylistUrl(event.target.value);
                  }}
                  placeholder="https://www.deezer.com/playlist/…"
                  aria-label="Deezer playlist URL"
                />
                <Button type="submit" size="lg" disabled={busy} className={styles.submit}>
                  {busy ? 'Queueing…' : 'Download'}
                  <ArrowRight size={16} aria-hidden />
                </Button>
              </div>
              {options}
            </form>
          </Tabs.Panel>

          <Tabs.Panel value="favorites">
            <form onSubmit={onFavoritesSubmit} className={styles.form}>
              <label className={styles.fieldLabel} htmlFor="user-id">
                Deezer user id
              </label>
              <div className={styles.row}>
                <Input
                  id="user-id"
                  size="lg"
                  value={userId}
                  onChange={(event) => {
                    setUserId(event.target.value);
                  }}
                  placeholder="e.g. 123456789"
                  inputMode="numeric"
                  aria-label="Deezer user id"
                />
                <Button type="submit" size="lg" disabled={busy} className={styles.submit}>
                  {busy ? 'Queueing…' : 'Download'}
                  <ArrowRight size={16} aria-hidden />
                </Button>
              </div>
              <p className={styles.help}>
                The number at the end of a profile link: deezer.com/profile/<mark>123456789</mark>
              </p>
              {options}
            </form>
          </Tabs.Panel>
        </Panel>
      </Tabs.Root>
    </div>
  );
}
