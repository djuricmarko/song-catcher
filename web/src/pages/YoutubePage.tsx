import { Download, Link2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { startYoutubeDownload } from '../api/client';
import { useAppConfig } from '../hooks/useAppConfig';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { Input } from '../components/ui/Input';

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
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h1 className="text-xl font-semibold text-zinc-900">Download with yt-dlp</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Paste a YouTube, Invidious, Vimeo, SoundCloud or other yt-dlp-supported URL. The audio is
        converted to MP3 and tagged by yt-dlp.
      </p>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Link2
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
              aria-hidden
            />
            <Input
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
              }}
              placeholder="https://www.youtube.com/watch?v=…"
              className="pl-9"
              aria-label="Video URL"
            />
          </div>
          <Button type="submit" disabled={busy} className="sm:w-36">
            <Download className="size-4" aria-hidden />
            {busy ? 'Queueing…' : 'Download'}
          </Button>
        </div>
        {mpdEnabled ? (
          <Checkbox
            checked={addToPlaylist}
            onChange={(event) => {
              setAddToPlaylist(event.target.checked);
            }}
            label="Add to MPD playlist"
          />
        ) : null}
      </form>
    </section>
  );
}
