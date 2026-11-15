import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { SearchResultDto } from '@song-catcher/shared';

import { isAbortError } from '../lib/errors';

export type PreviewPlayer = ReturnType<typeof usePreviewPlayer>;

/**
 * Plays 30-second track previews, one at a time, through a single audio
 * element that is created on first use and stopped when the page unmounts.
 */
export function usePreviewPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  // Bumped on every play/pause so a late play() rejection for a preview the
  // user has already paused or replaced is ignored.
  const attemptRef = useRef(0);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function getAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.addEventListener('ended', () => {
        setPlayingUrl(null);
      });
      audioRef.current = audio;
    }
    return audioRef.current;
  }

  /** Starts the preview at `url`, or pauses it when it is the one playing. */
  function toggle(url: string): void {
    if (!url) {
      return;
    }
    const audio = getAudio();

    if (playingUrl === url) {
      attemptRef.current++;
      audio.pause();
      setPlayingUrl(null);
      return;
    }

    audio.src = url;
    setPlayingUrl(url);

    // The first fetch of a preview that is cold on Deezer's CDN can make the
    // initial play() reject even though the file is fine; one reload + retry
    // succeeds. Rejections for a source the user has since switched away from
    // (AbortError, or a newer play/pause) are ignored so they cannot clear the
    // newly playing track or show a bogus error.
    const attempt = ++attemptRef.current;
    const isOutdated = (error: unknown) => attemptRef.current !== attempt || isAbortError(error);

    audio.play().catch((error: unknown) => {
      if (isOutdated(error)) {
        return;
      }
      console.warn('Preview playback failed, retrying once', error);
      audio.load();
      audio.play().catch((retryError: unknown) => {
        if (isOutdated(retryError)) {
          return;
        }
        console.error('Preview playback failed', retryError);
        setPlayingUrl(null);
        toast.error('Could not play the preview');
      });
    });
  }

  /** Toggles the preview of a search result; results without one are ignored. */
  function toggleResult(result: SearchResultDto): void {
    toggle(result.preview_url);
  }

  /** True when `url` is the preview currently playing. */
  function isPlaying(url: string): boolean {
    return playingUrl !== null && playingUrl === url;
  }

  return { toggleResult, isPlaying };
}
