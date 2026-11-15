import { ArrowRight, Link2 } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { toast } from 'sonner';

import { startYoutubeDownload, startYoutubePlaylistDownload } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { PasteButton } from '../../components/PasteButton';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { Panel } from '../../components/ui/Panel';
import { useAppConfig } from '../../hooks/useAppConfig';
import { useEnqueue } from '../../hooks/useEnqueue';
import { dismissKeyboard } from '../../lib/dismissKeyboard';
import { playlistLinkKind } from '../../lib/playlistUrl';

import styles from './YoutubePage.module.css';

export function YoutubePage() {
  const appConfig = useAppConfig();
  const mpdEnabled = appConfig.data?.useMpd ?? false;
  const [url, setUrl] = useState('');
  const [addToPlaylist, setAddToPlaylist] = useState(false);
  const [createZip, setCreateZip] = useState(false);
  const [entirePlaylist, setEntirePlaylist] = useState(false);
  const { busy, enqueue } = useEnqueue();

  const linkKind = playlistLinkKind(url);
  const playlistMode = linkKind === 'playlist' || (linkKind === 'video' && entirePlaylist);

  function changeUrl(next: string) {
    if (playlistLinkKind(next) !== 'video') {
      setEntirePlaylist(false);
    }
    setUrl(next);
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed.startsWith('http')) {
      toast.error('Enter an http(s) URL');
      return;
    }

    dismissKeyboard();
    const start = playlistMode
      ? () => startYoutubePlaylistDownload(trimmed, addToPlaylist, createZip)
      : () => startYoutubeDownload(trimmed, addToPlaylist);
    void enqueue(start, {
      successMessage: playlistMode ? 'Playlist queued' : 'Download queued',
      onQueued: () => {
        changeUrl('');
      },
    });
  }

  return (
    <div>
      <PageHeader
        index="02"
        eyebrow="Video links"
        title={
          <>
            Rip the audio <em>from anywhere</em>
          </>
        }
        description="Paste any link yt-dlp understands. The audio track is extracted, converted to MP3 and tagged. A YouTube playlist link downloads every song in it."
      />

      <Panel as="form" onSubmit={onSubmit} className={styles.panel}>
        <div className={styles.row}>
          <Input
            size="lg"
            value={url}
            onChange={(event) => {
              changeUrl(event.target.value);
            }}
            leading={<Link2 size={18} aria-hidden />}
            trailing={url ? undefined : <PasteButton onPaste={changeUrl} label="Paste link" />}
            placeholder="https://www.youtube.com/watch?v=…"
            aria-label="Video URL"
            inputMode="url"
            enterKeyHint="go"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <Button type="submit" size="lg" disabled={busy} className={styles.submit}>
            {busy ? 'Queueing…' : playlistMode ? 'Extract playlist' : 'Extract'}
            <ArrowRight size={16} aria-hidden />
          </Button>
        </div>
        {mpdEnabled || linkKind !== 'none' ? (
          <div className={styles.options}>
            {linkKind === 'video' ? (
              <Checkbox
                checked={entirePlaylist}
                onCheckedChange={setEntirePlaylist}
                label="Download the entire playlist"
                hint="This video is part of a playlist"
              />
            ) : null}
            {playlistMode ? (
              <Checkbox
                checked={createZip}
                onCheckedChange={setCreateZip}
                label="Pack into a zip"
                hint="One archive with every song and the m3u8"
              />
            ) : null}
            {mpdEnabled ? (
              <Checkbox checked={addToPlaylist} onCheckedChange={setAddToPlaylist} label="Add to MPD playlist" />
            ) : null}
          </div>
        ) : null}
      </Panel>

      <div className={styles.sources}>
        <span className={styles.sourcesLabel}>Works with</span>
        <ul className={styles.sourceList}>
          {['YouTube', 'SoundCloud', 'Vimeo', 'Bandcamp', 'Invidious', 'Mixcloud'].map((source) => (
            <li key={source}>{source}</li>
          ))}
          <li className={styles.more}>and many more</li>
        </ul>
      </div>
    </div>
  );
}
