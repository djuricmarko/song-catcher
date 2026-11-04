import { ArrowRight, Link2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { startYoutubeDownload } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { PasteButton } from '../../components/PasteButton';
import { Panel } from '../../components/ui/Panel';
import { useAppConfig } from '../../hooks/useAppConfig';
import { dismissKeyboard } from '../../lib/dismissKeyboard';

import styles from './YoutubePage.module.css';

const SOURCES = ['YouTube', 'SoundCloud', 'Vimeo', 'Bandcamp', 'Invidious', 'Mixcloud'];

export function YoutubePage() {
  const appConfig = useAppConfig();
  const mpdEnabled = appConfig.data?.useMpd ?? false;
  const [url, setUrl] = useState('');
  const [addToPlaylist, setAddToPlaylist] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed.startsWith('http')) {
      toast.error('Enter an http(s) URL');
      return;
    }

    dismissKeyboard();
    setBusy(true);
    try {
      const task = await startYoutubeDownload(trimmed, addToPlaylist);
      toast.success('Download queued', { description: `Task #${task.task_id}` });
      setUrl('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
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
        description="Paste any link yt-dlp understands. The audio track is extracted, converted to MP3 and tagged."
      />

      <Panel as="form" onSubmit={onSubmit} className={styles.panel}>
        <div className={styles.row}>
          <Input
            size="lg"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            leading={<Link2 size={18} aria-hidden />}
            trailing={url ? undefined : <PasteButton onPaste={setUrl} label="Paste link" />}
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
            {busy ? 'Queueing…' : 'Extract'}
            <ArrowRight size={16} aria-hidden />
          </Button>
        </div>
        {mpdEnabled ? (
          <Checkbox checked={addToPlaylist} onCheckedChange={setAddToPlaylist} label="Add to MPD playlist" />
        ) : null}
      </Panel>

      <div className={styles.sources}>
        <span className={styles.sourcesLabel}>Works with</span>
        <ul className={styles.sourceList}>
          {SOURCES.map((source) => (
            <li key={source}>{source}</li>
          ))}
          <li className={styles.more}>and many more</li>
        </ul>
      </div>
    </div>
  );
}
