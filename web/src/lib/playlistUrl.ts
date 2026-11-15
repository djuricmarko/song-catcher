export type PlaylistLinkKind = 'none' | 'playlist' | 'video';

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
  if (['/playlist', '/embed/videoseries'].includes(pathname)) {
    return 'playlist';
  }
  return /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(url.hostname.toLowerCase()) ? 'video' : 'none';
}
