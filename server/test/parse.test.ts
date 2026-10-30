import { describe, expect, it } from 'vitest';

import {
  apiErrorText,
  extractAppState,
  extractPlaylistId,
  mapSearchResult,
} from '../src/deezer/parse.js';

describe('extractAppState', () => {
  it('extracts the Deezer page state from an inline script', () => {
    const html = `<html><script>{"DATA":{"__TYPE__":"album","ART_NAME":"Artist"},"SONGS":{"data":[{"SNG_ID":"1"}]}}</script></html>`;
    const state = extractAppState(html);

    expect(state?.DATA?.__TYPE__).toBe('album');
    expect(state?.DATA?.ART_NAME).toBe('Artist');
    expect(state?.SONGS?.data?.[0]?.SNG_ID).toBe('1');
  });

  it('ignores invalid scripts and keeps looking', () => {
    const html = `<html>
      <script>{"DATA": not json}</script>
      <script>{"DATA":{"__TYPE__":"song"}}</script>
    </html>`;

    expect(extractAppState(html)?.DATA?.__TYPE__).toBe('song');
  });

  it('returns undefined when no state is present', () => {
    expect(extractAppState('<html></html>')).toBeUndefined();
  });
});

describe('extractPlaylistId', () => {
  it.each([
    ['https://www.deezer.com/us/playlist/123', '123'],
    ['https://www.deezer.com/playlist/456?utm=1', '456'],
    ['789', '789'],
  ])('extracts %s', (input, expected) => {
    expect(extractPlaylistId(input)).toBe(expected);
  });

  it('returns undefined for invalid input', () => {
    expect(extractPlaylistId('https://www.deezer.com/us/album/123')).toBeUndefined();
  });
});

describe('mapSearchResult', () => {
  it('maps tracks', () => {
    expect(
      mapSearchResult(
        {
          id: 1,
          title: 'Song',
          preview: 'preview',
          artist: { id: 2, name: 'Artist' },
          album: { id: 3, title: 'Album', cover_small: 'cover' },
        },
        'track',
      ),
    ).toEqual({
      id: '1',
      id_type: 'track',
      title: 'Song',
      img_url: 'cover',
      album: 'Album',
      album_id: 3,
      artist: 'Artist',
      preview_url: 'preview',
    });
  });

  it('maps albums', () => {
    expect(
      mapSearchResult(
        { id: 3, title: 'Album', cover_small: 'cover', artist: { name: 'Artist' } },
        'artist_album',
      ),
    ).toMatchObject({ id: '3', id_type: 'album', album: 'Album', artist: 'Artist' });
  });

  it('maps artists', () => {
    expect(
      mapSearchResult({ id: 2, name: 'Artist', picture_small: 'picture' }, 'artist'),
    ).toMatchObject({ id: '2', id_type: 'artist', artist: 'Artist', img_url: 'picture' });
  });
});

describe('apiErrorText', () => {
  it('formats strings and objects', () => {
    expect(apiErrorText('boom')).toBe('boom');
    expect(apiErrorText({ message: 'bad' })).toBe('bad');
    expect(apiErrorText(undefined)).toMatch(/unknown/);
  });
});
