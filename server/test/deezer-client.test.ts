import nock from 'nock';
import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/env.js';
import { Deezer403Exception, Deezer404Exception, DeezerClient } from '../src/deezer/client.js';

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
        data: [{ media: [{ sources: [{ url: 'https://cdn/song.mp3' }] }] }],
      });

    const client = makeClient();
    await client.init();
    const url = await client.getSongUrl('track-token');
    expect(url).toBe('https://cdn/song.mp3');
  });
});
