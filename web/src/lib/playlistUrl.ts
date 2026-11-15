/**
 * What a pasted link says about playlists:
 * - `playlist`: the link is a playlist page; there is no single video to pick.
 * - `video`: one video opened from a playlist; either could be meant.
 * - `none`: no playlist involved.
 */
export type PlaylistLinkKind = 'none' | 'playlist' | 'video';

const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/;
const PLAYLIST_PATHS = new Set(['/playlist', '/embed/videoseries']);

export function playlistLinkKind(value: string): PlaylistLinkKind {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return 'none';
  }
  if (!url.searchParams.get('list')) {
    return 'none';
  }

  const pathname = url.pathname.replace(/\/+$/, '');
  if (PLAYLIST_PATHS.has(pathname)) {
    // Also covers YouTube frontends on other hosts, e.g. Invidious.
    return 'playlist';
  }
  return YOUTUBE_HOST.test(url.hostname.toLowerCase()) ? 'video' : 'none';
}
