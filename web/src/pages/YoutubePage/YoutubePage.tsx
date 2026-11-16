import { useState } from 'react';
import { toast } from 'sonner';

import { startYoutubeDownload, startYoutubePlaylistDownload } from '../../api/client';
import { Composer, ComposerStage } from '../../components/Composer';
import { ToggleChip } from '../../components/ui/ToggleChip';
import { useAppConfig } from '../../hooks/useAppConfig';
import { useEnqueue } from '../../hooks/useEnqueue';
import { playlistLinkKind } from '../../lib/playlistUrl';

export function YoutubePage() {
  const mpdEnabled = useAppConfig().data?.useMpd ?? false;
  const [url, setUrl] = useState('');
  const [addToPlaylist, setAddToPlaylist] = useState(false);
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

  function submit() {
    const trimmed = url.trim();
    if (!trimmed.startsWith('http')) {
      toast.error('Enter an http(s) URL');
      return;
    }

    const start = playlistMode
      ? () => startYoutubePlaylistDownload(trimmed, addToPlaylist)
      : () => startYoutubeDownload(trimmed, addToPlaylist);
    void enqueue(start, {
      successMessage: playlistMode ? 'Playlist queued' : 'Download queued',
      onQueued: () => {
        changeUrl('');
      },
    });
  }

  return (
    <ComposerStage>
      <Composer
        value={url}
        onValueChange={changeUrl}
        onSubmit={submit}
        busy={busy}
        placeholder="Paste a song or playlist link"
        inputLabel="Video URL"
        submitLabel={playlistMode ? 'Download playlist' : 'Download'}
        inputMode="url"
        footer={
          linkKind === 'video' || mpdEnabled ? (
            <>
              {linkKind === 'video' ? (
                <ToggleChip
                  pressed={entirePlaylist}
                  onPressedChange={setEntirePlaylist}
                  label="Entire playlist"
                  title="This video is part of a playlist"
                />
              ) : null}
              {mpdEnabled ? (
                <ToggleChip pressed={addToPlaylist} onPressedChange={setAddToPlaylist} label="Add to MPD playlist" />
              ) : null}
            </>
          ) : undefined
        }
      />
    </ComposerStage>
  );
}
