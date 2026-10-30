import { Download, ListMusic, Play, User } from 'lucide-react';

import type { SearchResultDto } from '@deezer-downloader/shared';

import { Button } from './ui/Button';

interface SearchResultCardProps {
  result: SearchResultDto;
  busy: boolean;
  onDownloadTrack: (result: SearchResultDto) => void;
  onDownloadAlbum: (result: SearchResultDto) => void;
  onShowAlbumTracks: (result: SearchResultDto) => void;
  onArtistTop: (result: SearchResultDto) => void;
  onArtistAlbums: (result: SearchResultDto) => void;
}

export function SearchResultCard({
  result,
  busy,
  onDownloadTrack,
  onDownloadAlbum,
  onShowAlbumTracks,
  onArtistTop,
  onArtistAlbums,
}: SearchResultCardProps) {
  const isTrack = result.id_type === 'track';
  const isAlbum = result.id_type === 'album';
  const title = isTrack ? result.title : isAlbum ? result.album : result.artist;
  const subtitle = isTrack
    ? [result.artist, result.album].filter(Boolean).join(' • ')
    : isAlbum
      ? result.artist
      : 'Artist';

  return (
    <div className="flex gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      {result.img_url ? (
        <img
          src={result.img_url}
          alt=""
          className="size-20 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400">
          <ListMusic className="size-6" aria-hidden />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-900">{title || 'Unknown'}</p>
        <p className="mt-0.5 truncate text-xs text-zinc-500">{subtitle}</p>

        {isTrack && result.preview_url ? (
          <div className="mt-2 flex items-center gap-2">
            <Play className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
            <audio
              controls
              preload="none"
              src={result.preview_url}
              className="h-8 w-full max-w-sm"
            />
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-2">
          {isTrack ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                onDownloadTrack(result);
              }}
            >
              <Download className="size-3.5" aria-hidden />
              Download track
            </Button>
          ) : null}

          {isAlbum ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  onShowAlbumTracks(result);
                }}
              >
                Show tracks
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  onDownloadAlbum(result);
                }}
              >
                <Download className="size-3.5" aria-hidden />
                Download album
              </Button>
            </>
          ) : null}

          {!isTrack && !isAlbum ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  onArtistTop(result);
                }}
              >
                <User className="size-3.5" aria-hidden />
                Top tracks
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  onArtistAlbums(result);
                }}
              >
                Albums
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
