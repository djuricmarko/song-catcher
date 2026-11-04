import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import nock from 'nock';
import NodeID3 from 'node-id3';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../src/config/env.js';
import {
  Deezer403Exception,
  Deezer404Exception,
  DeezerClient,
  isDeezerShortLink,
} from '../src/deezer/client.js';
import type { DeezerSong } from '../src/deezer/types.js';

const ARL = 'a'.repeat(192);
const logger = pino({ level: 'silent' });

function makeClient(): DeezerClient {
  const config = loadConfig(
    {
      DEEZER_COOKIE_ARL: ARL,
      DEEZER_QUALITY: 'flac',
      DEEZER_MPD_ENABLED: 'false',
    },
    { cwd: '/tmp' },
  );
  return new DeezerClient(config, logger);
}

function makeMp3Client(): DeezerClient {
  const config = loadConfig({ DEEZER_COOKIE_ARL: ARL, DEEZER_QUALITY: 'mp3' }, { cwd: '/tmp' });
  return new DeezerClient(config, logger);
}

const userDataUrl = {
  method: 'deezer.getUserData',
  input: '3',
  api_version: '1.0',
  api_token: '',
};

afterEach(() => {
  nock.cleanAll();
});

describe('DeezerClient.init', () => {
  it('stores the license token and uses lossless when available', async () => {
    nock('https://www.deezer.com')
      .get('/ajax/gw-light.php')
      .query(userDataUrl)
      .reply(200, {
        results: {
          USER: {
            OPTIONS: {
              license_token: 'license',
              web_sound_quality: { lossless: true },
            },
          },
        },
      });

    const client = makeClient();
    await client.init();

    expect(client.isInitialized).toBe(true);
    expect(client.currentSoundFormat).toBe('FLAC');
    expect(client.fileExtension).toBe('flac');
  });

  it('falls back to MP3_128 when lossless is unavailable', async () => {
    nock('https://www.deezer.com')
      .get('/ajax/gw-light.php')
      .query(userDataUrl)
      .reply(200, {
        results: {
          USER: {
            OPTIONS: {
              license_token: 'license',
              web_sound_quality: { lossless: false },
            },
          },
        },
      });

    const client = makeClient();
    await client.init();

    expect(client.currentSoundFormat).toBe('MP3_128');
  });

  it('uses MP3_320 for high-quality accounts without lossless', async () => {
    nock('https://www.deezer.com')
      .get('/ajax/gw-light.php')
      .query(userDataUrl)
      .reply(200, {
        results: {
          USER: {
            OPTIONS: {
              license_token: 'license',
              web_sound_quality: { high: true, lossless: false },
            },
          },
        },
      });

    const client = makeClient();
    await client.init();

    expect(client.currentSoundFormat).toBe('MP3_320');
    expect(client.fileExtension).toBe('mp3');
  });

  it('rejects missing license data', async () => {
    nock('https://www.deezer.com')
      .get('/ajax/gw-light.php')
      .query(userDataUrl)
      .reply(200, {
        results: { USER: {} },
      });

    const client = makeClient();
    await expect(client.init()).rejects.toThrowError(/DEEZER_COOKIE_ARL/);
  });
});

describe('DeezerClient search', () => {
  it('maps track search results', async () => {
    nock('https://api.deezer.com')
      .get('/search/track')
      .query({ q: 'moby' })
      .reply(200, {
        data: [
          {
            id: 1,
            title: 'Song',
            preview: 'preview',
            artist: { id: 2, name: 'Artist' },
            album: { id: 3, title: 'Album', cover_small: 'cover' },
          },
        ],
      });

    const results = await makeClient().deezerSearch('moby', 'track');

    expect(results).toEqual([
      {
        id: '1',
        id_type: 'track',
        title: 'Song',
        img_url: 'cover',
        album: 'Album',
        album_id: 3,
        artist: 'Artist',
        preview_url: 'preview',
      },
    ]);
  });

  it('uses the album endpoint for album tracks', async () => {
    nock('https://api.deezer.com')
      .get('/album/3')
      .reply(200, {
        tracks: {
          data: [
            {
              id: 1,
              title: 'Song',
              preview: 'preview',
              artist: { id: 2, name: 'Artist' },
              album: { id: 3, title: 'Album', cover_small: 'cover' },
            },
          ],
        },
      });

    const results = await makeClient().deezerSearch('3', 'album_track');
    expect(results[0]?.album_id).toBe(3);
  });

  it('uses the album for album tracks that lack an album object', async () => {
    nock('https://api.deezer.com')
      .get('/album/3')
      .reply(200, {
        id: 3,
        title: 'Album',
        cover_small: 'cover',
        tracks: { data: [{ id: 1, title: 'Song', artist: { id: 2, name: 'Artist' } }] },
      });

    const results = await makeClient().deezerSearch('3', 'album_track');
    expect(results).toEqual([
      expect.objectContaining({ id: '1', album: 'Album', album_id: 3, img_url: 'cover' }),
    ]);
  });

  it('surfaces API errors', async () => {
    nock('https://api.deezer.com')
      .get('/search/track')
      .query({ q: 'moby' })
      .reply(200, { error: { message: 'quota exceeded' } });

    await expect(makeClient().deezerSearch('moby', 'track')).rejects.toThrowError(/quota exceeded/);
  });
});

describe('DeezerClient page parsing', () => {
  it('fetches a track and its album artist', async () => {
    nock('https://www.deezer.com')
      .get('/us/track/1')
      .reply(
        200,
        `<html><script>{"DATA":{"__TYPE__":"song","SNG_ID":"1","SNG_TITLE":"Song","ART_NAME":"Artist","ALB_TITLE":"Album","ALB_PICTURE":"pic","ALB_ID":"3","TRACK_TOKEN":"token","MD5_ORIGIN":"origin"}}</script></html>`,
      )
      .get('/us/album/3')
      .reply(
        200,
        `<html><script>{"DATA":{"__TYPE__":"album","ART_NAME":"Album Artist","PHYSICAL_RELEASE_DATE":"2024-01-02","MD5_ORIGIN":"origin"}}</script></html>`,
      );

    const song = await makeClient().getSongInfosFromWebsite('track', '1');

    expect(song.SNG_TITLE).toBe('Song');
    expect(song.ALB_ART_NAME).toBe('Album Artist');
    expect(song.PHYSICAL_RELEASE_DATE).toBe('2024-01-02');
  });

  it('returns album songs and sets the album artist', async () => {
    nock('https://www.deezer.com')
      .get('/us/album/3')
      .reply(
        200,
        `<html><script>{"DATA":{"__TYPE__":"album","ART_NAME":"Album Artist"},"SONGS":{"data":[{"SNG_ID":"1","SNG_TITLE":"Song","ART_NAME":"Artist","ALB_TITLE":"Album","ALB_PICTURE":"pic","TRACK_TOKEN":"token","MD5_ORIGIN":"origin"}]}}</script></html>`,
      );

    const songs = await makeClient().getSongInfosFromWebsite('album', '3');
    expect(songs).toHaveLength(1);
    expect(songs[0]?.ALB_ART_NAME).toBe('Album Artist');
  });

  it('detects missing login and 404s', async () => {
    nock('https://www.deezer.com').get('/us/track/1').reply(200, '<html>login</html>');
    await expect(makeClient().getSongInfosFromWebsite('track', '1')).rejects.toBeInstanceOf(
      Deezer403Exception,
    );

    nock('https://www.deezer.com').get('/us/track/2').reply(404);
    await expect(makeClient().getSongInfosFromWebsite('track', '2')).rejects.toBeInstanceOf(
      Deezer404Exception,
    );
  });
});

describe('DeezerClient playlist and favorites', () => {
  it('loads a playlist through the website API', async () => {
    nock('https://www.deezer.com')
      .post('/ajax/gw-light.php')
      .query(userDataUrl)
      .reply(200, { results: { checkForm: 'csrf' } })
      .post('/ajax/gw-light.php')
      .query({
        method: 'deezer.pagePlaylist',
        input: '3',
        api_version: '1.0',
        api_token: 'csrf',
      })
      .reply(200, {
        error: [],
        results: {
          DATA: { TITLE: 'Playlist', NB_SONG: 1 },
          SONGS: {
            count: 1,
            data: [
              {
                SNG_ID: '1',
                SNG_TITLE: 'Song',
                ART_NAME: 'Artist',
                ALB_TITLE: 'Album',
                ALB_PICTURE: 'pic',
                TRACK_TOKEN: 'token',
                MD5_ORIGIN: 'origin',
              },
            ],
          },
        },
      });

    const playlist = await makeClient().parseDeezerPlaylist(
      'https://www.deezer.com/us/playlist/123',
    );

    expect(playlist.name).toBe('Playlist');
    expect(playlist.songs).toHaveLength(1);
  });

  it('paginates favorites', async () => {
    nock('https://api.deezer.com')
      .get('/user/123/tracks')
      .query({ limit: '10000000000' })
      .reply(200, {
        data: [{ id: 1 }, { id: 2 }],
        total: 3,
        next: 'https://api.deezer.com/user/123/tracks?limit=10000000000&index=2',
      })
      .get('/user/123/tracks')
      .query({ limit: '10000000000', index: '2' })
      .reply(200, { data: [{ id: 3 }], total: 3 });

    const ids = await makeClient().getDeezerFavorites('123');
    expect(ids).toEqual(['1', '2', '3']);
  });

  it('resolves a song URL from the media API', async () => {
    nock('https://www.deezer.com')
      .get('/ajax/gw-light.php')
      .query(userDataUrl)
      .reply(200, {
        results: {
          USER: {
            OPTIONS: {
              license_token: 'license',
              web_sound_quality: { lossless: false },
            },
          },
        },
      });
    nock('https://media.deezer.com')
      .post('/v1/get_url', (body) => body.track_tokens[0] === 'track-token')
      .reply(200, {
        data: [{ media: [{ format: 'MP3_128', sources: [{ url: 'https://cdn/song.mp3' }] }] }],
      });

    const client = makeClient();
    await client.init();
    const source = await client.getSongUrl('track-token');
    expect(source).toEqual({ url: 'https://cdn/song.mp3', format: 'MP3_128' });
  });

  it('requests fallback formats and reports the one Deezer returned', async () => {
    nock('https://www.deezer.com')
      .get('/ajax/gw-light.php')
      .query(userDataUrl)
      .reply(200, {
        results: {
          USER: {
            OPTIONS: {
              license_token: 'license',
              web_sound_quality: { high: true, lossless: true },
            },
          },
        },
      });
    let requestedFormats: unknown;
    nock('https://media.deezer.com')
      .post('/v1/get_url', (body) => {
        requestedFormats = body.media[0].formats;
        return true;
      })
      .reply(200, {
        data: [{ media: [{ format: 'MP3_320', sources: [{ url: 'https://cdn/song' }] }] }],
      });

    const client = makeClient();
    await client.init();
    const source = await client.getSongUrl('track-token');

    expect(requestedFormats).toEqual([
      { cipher: 'BF_CBC_STRIPE', format: 'FLAC' },
      { cipher: 'BF_CBC_STRIPE', format: 'MP3_320' },
      { cipher: 'BF_CBC_STRIPE', format: 'MP3_128' },
    ]);
    expect(source.format).toBe('MP3_320');
  });
});

describe('DeezerClient.downloadSong', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'deezer-download-test-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function mockInit(): void {
    nock('https://www.deezer.com')
      .get('/ajax/gw-light.php')
      .query(userDataUrl)
      .reply(200, {
        results: {
          USER: {
            OPTIONS: { license_token: 'license', web_sound_quality: { lossless: false } },
          },
        },
      });
  }

  function mockSong(times: number): void {
    nock('https://media.deezer.com')
      .post('/v1/get_url')
      .times(times)
      .reply(200, {
        data: [{ media: [{ format: 'MP3_128', sources: [{ url: 'https://cdn.test/song' }] }] }],
      });
    // Shorter than one 2048-byte block, so it passes through the decryptor unchanged.
    nock('https://cdn.test').get('/song').times(times).reply(200, 'audio');
  }

  const downloadable: DeezerSong = {
    SNG_ID: '42',
    SNG_TITLE: 'Title',
    ART_NAME: 'Artist',
    ALB_TITLE: 'Album',
    ALB_PICTURE: 'pic',
    TRACK_TOKEN: 'token',
    MD5_ORIGIN: 'origin',
  };

  it('still writes tags when the cover cannot be downloaded', async () => {
    mockInit();
    mockSong(1);
    nock('https://e-cdns-images.dzcdn.net').get('/images/cover/pic/1200x1200.jpg').reply(500);

    const client = makeMp3Client();
    await client.init();
    const output = path.join(directory, 'song.mp3');
    await client.downloadSong(downloadable, output);

    const tags = await NodeID3.Promise.read(output);
    expect(tags.title).toBe('Title');
    expect(tags.artist).toBe('Artist');
    expect(tags.image).toBeFalsy();
  });

  it('downloads a shared album cover only once', async () => {
    mockInit();
    mockSong(2);
    const cover = nock('https://e-cdns-images.dzcdn.net')
      .get('/images/cover/pic/1200x1200.jpg')
      .once()
      .reply(200, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const client = makeMp3Client();
    await client.init();
    const first = path.join(directory, 'one.mp3');
    const second = path.join(directory, 'two.mp3');
    await Promise.all([
      client.downloadSong(downloadable, first),
      client.downloadSong({ ...downloadable, SNG_ID: '43' }, second),
    ]);

    expect(cover.isDone()).toBe(true);
    expect((await NodeID3.Promise.read(first)).image).toBeTruthy();
    expect((await NodeID3.Promise.read(second)).image).toBeTruthy();
  });
});

describe('DeezerClient session refresh', () => {
  function mockUserData(licenseToken: string) {
    return nock('https://www.deezer.com')
      .get('/ajax/gw-light.php')
      .query(userDataUrl)
      .reply(200, {
        results: {
          USER: {
            OPTIONS: { license_token: licenseToken, web_sound_quality: { lossless: false } },
          },
        },
      });
  }

  const albumPage = `<html><script>{"DATA":{"__TYPE__":"album","ART_NAME":"Album Artist","MD5_ORIGIN":"origin"},"SONGS":{"data":[]}}</script></html>`;

  it('refreshes the session and retries once when the page says we are logged out', async () => {
    vi.useFakeTimers({ now: 0, toFake: ['Date'] });
    try {
      mockUserData('first');
      const client = makeClient();
      await client.init();
      vi.setSystemTime(10 * 60_000);

      const refresh = mockUserData('second');
      nock('https://www.deezer.com')
        .get('/us/album/3')
        .reply(200, '<html>login</html>')
        .get('/us/album/3')
        .reply(200, albumPage);

      await expect(client.getSongInfosFromWebsite('album', '3')).resolves.toEqual([]);
      expect(refresh.isDone()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries get_url with the new license token after a license error', async () => {
    vi.useFakeTimers({ now: 0, toFake: ['Date'] });
    try {
      mockUserData('expired');
      const client = makeClient();
      await client.init();
      vi.setSystemTime(10 * 60_000);

      mockUserData('fresh');
      nock('https://media.deezer.com')
        .post('/v1/get_url', (body) => body.license_token === 'expired')
        .reply(200, { data: [{ errors: [{ message: 'License token expired' }] }] })
        .post('/v1/get_url', (body) => body.license_token === 'fresh')
        .reply(200, {
          data: [{ media: [{ format: 'MP3_128', sources: [{ url: 'https://cdn/song' }] }] }],
        });

      await expect(client.getSongUrl('token')).resolves.toEqual({
        url: 'https://cdn/song',
        format: 'MP3_128',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not refresh again within the rate-limit window or for unrelated errors', async () => {
    mockUserData('first');
    const client = makeClient();
    await client.init();

    const refresh = mockUserData('second');
    nock('https://www.deezer.com').get('/us/album/3').reply(200, '<html>login</html>');
    await expect(client.getSongInfosFromWebsite('album', '3')).rejects.toBeInstanceOf(
      Deezer403Exception,
    );

    nock('https://media.deezer.com')
      .post('/v1/get_url')
      .reply(200, { data: [{ errors: [{ message: 'Track token has no sufficient rights' }] }] });
    await expect(client.getSongUrl('token')).rejects.toThrowError(/no sufficient rights/);

    expect(refresh.isDone()).toBe(false);
  });
});

describe('isDeezerShortLink', () => {
  it('accepts only real Deezer short-link hosts over https', () => {
    expect(isDeezerShortLink('https://link.deezer.com/s/abc')).toBe(true);
    expect(isDeezerShortLink('https://deezer.page.link/xyz')).toBe(true);
    expect(isDeezerShortLink('https://evil.example/?link.deezer.com')).toBe(false);
    expect(isDeezerShortLink('https://link.deezer.com.evil.example/')).toBe(false);
    expect(isDeezerShortLink('http://link.deezer.com/s/abc')).toBe(false);
    expect(isDeezerShortLink('link.deezer.com/s/abc')).toBe(false);
    expect(isDeezerShortLink('12345')).toBe(false);
  });

  it('does not contact non-Deezer hosts that mention link.deezer.com', async () => {
    const evil = nock('https://evil.example').head('/').query(true).reply(200);
    await expect(
      makeClient().parseDeezerPlaylist('https://evil.example/?link.deezer.com'),
    ).rejects.toThrowError(/playlist id/);
    expect(evil.isDone()).toBe(false);
  });
});
