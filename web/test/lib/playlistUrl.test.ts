import { describe, expect, it } from 'vitest';

import { playlistLinkKind } from '../../src/lib/playlistUrl';

describe('playlistLinkKind', () => {
  it.each([
    'https://www.youtube.com/playlist?list=PL123',
    '  https://music.youtube.com/playlist?list=OLAK5uy  ',
    'https://youtube.com/playlist/?list=PL123',
    'https://www.youtube-nocookie.com/embed/videoseries?list=PL123',
    'https://yewtu.be/playlist?list=PL123',
  ])('recognises the playlist page %s', (url) => {
    expect(playlistLinkKind(url)).toBe('playlist');
  });

  it.each([
    'https://www.youtube.com/watch?v=abc&list=PL123&index=2',
    'https://youtu.be/abc?list=PL123',
    'https://m.youtube.com/watch?list=RDabc&v=abc',
  ])('recognises the video inside a playlist %s', (url) => {
    expect(playlistLinkKind(url)).toBe('video');
  });

  it.each([
    '',
    'not a url',
    'https://www.youtube.com/watch?v=abc',
    'https://www.youtube.com/playlist',
    'https://www.youtube.com/playlist?list=',
    'https://example.com/watch?v=abc&list=PL123',
    'https://notyoutube.com/watch?v=abc&list=PL123',
    'https://soundcloud.com/artist/sets/album',
  ])('sees no playlist in %j', (url) => {
    expect(playlistLinkKind(url)).toBe('none');
  });
});
