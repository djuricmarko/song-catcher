import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

import got, { type Got } from 'got';
import type { Logger } from 'pino';
import { CookieJar } from 'tough-cookie';

import type { AppConfig } from '../config/env.js';
import { errorMessage } from '../lib/errors.js';
import { calcBfKey, createDecryptTransform } from './crypto.js';
import { Deezer403Exception, Deezer404Exception, DeezerApiException, isSessionError } from './errors.js';
import {
  extensionForFormat,
  isSoundFormat,
  preferredSoundFormats,
  type AccountQuality,
  type FileExtension,
  type SoundFormat,
} from './formats.js';
import { writeSongMetadata } from './metadata.js';
import { apiErrorText, extractAppState, extractPlaylistId, mapSearchResult, type AlbumContext } from './parse.js';
import { PictureCache } from './picture-cache.js';
import { createProxyAgent } from './proxy.js';
import type { MediaResponse, PlaylistResponse, SearchResponse, UserDataResponse } from './responses.js';
import {
  SEARCH_TYPES,
  type DeezerAppState,
  type DeezerSong,
  type PlaylistResult,
  type SearchResult,
  type SearchType,
  type WebsiteType,
} from './types.js';

const WEBSITE_URL = 'https://www.deezer.com';
const PUBLIC_API_URL = 'https://api.deezer.com';
const GW_LIGHT_URL = `${WEBSITE_URL}/ajax/gw-light.php`;
const USER_DATA_URL = `${GW_LIGHT_URL}?method=deezer.getUserData&input=3&api_version=1.0&api_token=`;
const USER_AGENT = 'Mozilla/5.0 (X11; Linux i686; rv:135.0) Gecko/20100101 Firefox/135.0';

export interface SongSource {
  url: string;
  format: SoundFormat;
}

export interface DownloadedSong {
  format: SoundFormat;
  extension: FileExtension;
}

interface UserData {
  licenseToken: string;
  quality: AccountQuality;
}

/**
 * Only real Deezer short-link hosts are followed; a substring match would let
 * any URL containing "link.deezer.com" make the server send a request to it.
 */
export function isDeezerShortLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['link.deezer.com', 'deezer.page.link'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function describeFailure<T>(context: string, request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw new DeezerApiException(`${context}: ${errorMessage(error)}`, { cause: error });
  }
}

function searchUrl(searchType: SearchType, search: string): string {
  const id = encodeURIComponent(search);
  switch (searchType) {
    case 'album_track':
      return `${PUBLIC_API_URL}/album/${id}`;
    case 'artist_top':
      return `${PUBLIC_API_URL}/artist/${id}/top?limit=20`;
    case 'artist_album':
      return `${PUBLIC_API_URL}/artist/${id}/albums`;
    default:
      return `${PUBLIC_API_URL}/search/${searchType}?${new URLSearchParams({ q: search }).toString()}`;
  }
}

export class DeezerClient {
  private readonly http: Got;
  private readonly jar = new CookieJar();
  private readonly pictures = new PictureCache(16);
  private licenseToken = '';
  private soundFormats: SoundFormat[] = ['MP3_128'];
  private initialized = false;
  private lastInitAt = 0;
  private refreshing: Promise<boolean> | undefined;

  public constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    const proxyAgent = createProxyAgent(config.deezer.proxyUrl);

    this.http = got.extend({
      cookieJar: this.jar,
      headers: {
        'user-agent': USER_AGENT,
        pragma: 'no-cache',
        origin: WEBSITE_URL,
        'accept-language': 'en-US,en;q=0.9',
        accept: '*/*',
        'cache-control': 'no-cache',
        'x-requested-with': 'XMLHttpRequest',
        referer: `${WEBSITE_URL}/login`,
        dnt: '1',
      },
      timeout: { response: 30_000, socket: 60_000 },
      retry: { limit: 0 },
      followRedirect: true,
      ...(proxyAgent ? { agent: { http: proxyAgent, https: proxyAgent } } : {}),
    });
  }

  public get isInitialized(): boolean {
    return this.initialized;
  }

  public get currentSoundFormat(): SoundFormat {
    return this.soundFormats[0] ?? 'MP3_128';
  }

  public get fileExtension(): FileExtension {
    return extensionForFormat(this.currentSoundFormat);
  }

  public async init(): Promise<void> {
    await this.setCookies();
    const userData = await this.getUserData();
    this.licenseToken = userData.licenseToken;
    this.setSongQuality(userData.quality);
    this.initialized = true;
    this.lastInitAt = Date.now();

    this.logger.info(
      {
        soundFormats: this.soundFormats,
        flacSupported: this.currentSoundFormat === 'FLAC',
      },
      'Deezer session initialized',
    );
  }

  public async testLogin(): Promise<boolean> {
    try {
      const song = await this.getSongInfosFromWebsite('track', '917265');
      this.logger.info({ songId: song.SNG_ID }, 'Deezer login is working');
      return true;
    } catch (error) {
      this.logger.warn({ err: error }, 'Deezer login check failed');
      return false;
    }
  }

  private async setCookies(): Promise<void> {
    await describeFailure('Could not set the Deezer ARL cookie', async () => {
      await this.jar.setCookie(`arl=${this.config.deezer.cookieArl}; Domain=.deezer.com; Path=/`, `${WEBSITE_URL}/`);
      await this.jar.setCookie('comeback=1; Domain=.deezer.com; Path=/', `${WEBSITE_URL}/`);
    });
  }

  private async getUserData(): Promise<UserData> {
    const body = await describeFailure('Could not retrieve the Deezer license token', () =>
      this.http.get(USER_DATA_URL).json<UserDataResponse>(),
    );

    const options = body.results?.USER?.OPTIONS;
    const licenseToken = options?.license_token;
    const webSoundQuality = options?.web_sound_quality;
    if (!licenseToken || !webSoundQuality) {
      throw new DeezerApiException('Could not retrieve the Deezer license token. Is DEEZER_COOKIE_ARL still valid?');
    }

    return {
      licenseToken,
      quality: {
        lossless: webSoundQuality.lossless === true,
        high: webSoundQuality.high === true || options.web_hq === true,
      },
    };
  }

  private setSongQuality(account: AccountQuality): void {
    if (this.config.deezer.quality === 'flac' && !account.lossless) {
      this.logger.warn(
        'DEEZER_QUALITY=flac is configured, but the Deezer account does not support lossless. Falling back to mp3.',
      );
    }
    this.soundFormats = preferredSoundFormats(this.config.deezer.quality, account);
  }

  private async getCsrfToken(): Promise<string> {
    const body = await describeFailure('Could not retrieve a Deezer CSRF token', () =>
      this.http.post(USER_DATA_URL).json<UserDataResponse>(),
    );
    const token = body.results?.checkForm;
    if (!token) {
      throw new DeezerApiException('Deezer did not return a CSRF token');
    }
    return token;
  }

  private refreshSession(): Promise<boolean> {
    if (this.refreshing) {
      return this.refreshing;
    }
    if (Date.now() - this.lastInitAt < 60_000) {
      return Promise.resolve(false);
    }

    this.logger.info('Deezer session looks expired; refreshing it');
    this.refreshing = this.init()
      .then(() => true)
      .catch((error: unknown) => {
        this.lastInitAt = Date.now();
        this.logger.error({ err: error }, 'could not refresh the Deezer session');
        return false;
      })
      .finally(() => {
        this.refreshing = undefined;
      });
    return this.refreshing;
  }

  private async withSessionRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isSessionError(error) && (await this.refreshSession())) {
        return operation();
      }
      throw error;
    }
  }

  public async getSongInfosFromWebsite(searchType: 'track', id: string | number): Promise<DeezerSong>;
  public async getSongInfosFromWebsite(searchType: 'album' | 'playlist', id: string | number): Promise<DeezerSong[]>;
  public async getSongInfosFromWebsite(
    searchType: WebsiteType,
    id: string | number,
  ): Promise<DeezerSong | DeezerSong[]> {
    const state = await this.fetchWebsiteState(searchType, id);
    const pageType = state.DATA?.__TYPE__;

    if (pageType === 'playlist' || pageType === 'album') {
      return this.songsOfCollection(state);
    }
    if (pageType === 'song') {
      const song = await this.songWithAlbumDetails(state.DATA as unknown as DeezerSong);
      return searchType === 'track' ? song : [song];
    }

    throw new DeezerApiException(`Unexpected Deezer page type '${pageType ?? 'unknown'}' for ${searchType}/${id}`);
  }

  private songsOfCollection(state: DeezerAppState): DeezerSong[] {
    const albumArtist = state.DATA?.ART_NAME?.trim() ?? '';
    const releaseDate = state.DATA?.PHYSICAL_RELEASE_DATE;
    const songs = state.SONGS?.data ?? [];

    for (const song of songs) {
      if (albumArtist) {
        song.ALB_ART_NAME = albumArtist;
      }
      if (releaseDate && !song.PHYSICAL_RELEASE_DATE) {
        song.PHYSICAL_RELEASE_DATE = releaseDate;
      }
    }
    return songs;
  }

  private async songWithAlbumDetails(song: DeezerSong): Promise<DeezerSong> {
    if (!song.ALB_ID) {
      return song;
    }
    try {
      const album = (await this.fetchWebsiteState('album', song.ALB_ID)).DATA;
      song.ALB_ART_NAME = album?.ART_NAME || song.ART_NAME;
      if (album?.PHYSICAL_RELEASE_DATE) {
        song.PHYSICAL_RELEASE_DATE = album.PHYSICAL_RELEASE_DATE;
      }
    } catch (error) {
      this.logger.warn({ err: error, songId: song.SNG_ID }, 'Could not retrieve the album artist for a track');
    }
    return song;
  }

  private fetchWebsiteState(searchType: WebsiteType, id: string | number): Promise<DeezerAppState> {
    return this.withSessionRetry(() => this.fetchWebsiteStateOnce(searchType, id));
  }

  private async fetchWebsiteStateOnce(searchType: WebsiteType, id: string | number): Promise<DeezerAppState> {
    const url = `${WEBSITE_URL}/us/${searchType}/${id}`;
    const response = await describeFailure(`Could not open ${url}`, () =>
      this.http.get(url, { throwHttpErrors: false, responseType: 'text' }),
    );

    if (response.statusCode === 404) {
      throw new Deezer404Exception(`Got a 404 for ${url} from Deezer`);
    }
    if (response.statusCode >= 400) {
      throw new DeezerApiException(`Got HTTP ${response.statusCode} for ${url} from Deezer`);
    }
    if (!response.body.includes('MD5_ORIGIN')) {
      throw new Deezer403Exception('We are not logged in on deezer.com. Please update DEEZER_COOKIE_ARL.');
    }

    const state = extractAppState(response.body);
    if (!state) {
      throw new DeezerApiException(`Could not parse the Deezer page state for ${url}`);
    }
    return state;
  }

  public async deezerSearch(search: string, searchType: SearchType): Promise<SearchResult[]> {
    if (!SEARCH_TYPES.includes(searchType)) {
      throw new DeezerApiException(`Unsupported search type: ${searchType}`);
    }

    const body = await describeFailure('Could not search for music', () =>
      this.http.get(searchUrl(searchType, search)).json<SearchResponse>(),
    );
    if (body.error) {
      throw new DeezerApiException(`Deezer search failed: ${apiErrorText(body.error)}`);
    }

    const isAlbumLookup = searchType === 'album_track';
    const items = isAlbumLookup ? (body.tracks?.data ?? []) : (body.data ?? []);
    const albumContext = isAlbumLookup ? (body as AlbumContext) : undefined;

    return items.flatMap((item) => mapSearchResult(item, searchType, albumContext) ?? []);
  }

  public async parseDeezerPlaylist(playlistIdOrUrl: string): Promise<PlaylistResult> {
    const input = playlistIdOrUrl.trim();
    const resolved = isDeezerShortLink(input)
      ? await describeFailure(`Could not resolve short link '${playlistIdOrUrl}'`, () => this.followRedirects(input))
      : input;

    const playlistId = extractPlaylistId(resolved);
    if (!playlistId) {
      throw new DeezerApiException(`Could not extract a playlist id from '${playlistIdOrUrl}'`);
    }

    const csrfToken = await this.getCsrfToken();
    const url = `${GW_LIGHT_URL}?method=deezer.pagePlaylist&input=3&api_version=1.0&api_token=${encodeURIComponent(csrfToken)}`;
    const body = await describeFailure(`Could not load Deezer playlist ${playlistId}`, () =>
      this.http
        .post(url, {
          json: {
            playlist_id: Number(playlistId),
            start: 0,
            tab: 0,
            header: true,
            lang: 'de',
            nb: 1_000_000,
          },
        })
        .json<PlaylistResponse>(),
    );

    if (body.error && body.error.length > 0) {
      throw new DeezerApiException(`Deezer API said: ${JSON.stringify(body.error)}`);
    }

    const data = body.results?.DATA;
    const songs = body.results?.SONGS;
    if (!data?.TITLE || !songs) {
      throw new DeezerApiException(`Deezer returned no data for playlist ${playlistId}`);
    }

    this.logger.info(
      { playlist: data.TITLE, totalSongs: data.NB_SONG, returnedSongs: songs.count },
      'fetched Deezer playlist',
    );
    return { name: data.TITLE, songs: songs.data ?? [] };
  }

  private async followRedirects(url: string): Promise<string> {
    const response = await this.http.head(url, {
      followRedirect: true,
      throwHttpErrors: false,
      timeout: { request: 10_000 },
    });
    return response.url;
  }

  public getSongUrl(trackToken: string): Promise<SongSource> {
    return this.withSessionRetry(() => this.getSongUrlOnce(trackToken));
  }

  private async getSongUrlOnce(trackToken: string): Promise<SongSource> {
    const response = await describeFailure('Could not retrieve song URL', () =>
      this.http.post('https://media.deezer.com/v1/get_url', {
        json: {
          license_token: this.licenseToken,
          media: [
            {
              type: 'FULL',
              formats: this.soundFormats.map((format) => ({ cipher: 'BF_CBC_STRIPE', format })),
            },
          ],
          track_tokens: [trackToken],
        },
        headers: { 'user-agent': USER_AGENT },
        responseType: 'json',
        throwHttpErrors: false,
      }),
    );

    const body = response.body as MediaResponse;
    if (response.statusCode >= 400) {
      throw new DeezerApiException(`Could not retrieve song URL: HTTP ${response.statusCode} ${JSON.stringify(body)}`, {
        sessionRelated: response.statusCode === 401 || response.statusCode === 403,
      });
    }

    const entry = body.data?.[0];
    if (!entry) {
      throw new DeezerApiException(`Could not get download URL from API. API response: ${JSON.stringify(body)}`);
    }
    if (entry.errors && entry.errors.length > 0) {
      const message = entry.errors[0]?.message ?? 'unknown error';
      throw new DeezerApiException(`Could not get download URL from API: ${message}`, {
        sessionRelated: /licen[cs]e|expired|session|auth/i.test(message),
      });
    }

    const media = entry.media?.[0];
    const url = media?.sources?.[0]?.url;
    if (!url) {
      throw new DeezerApiException(
        `Could not get download URL from API. There was no API error, but also no song information. API response: ${JSON.stringify(body)}`,
      );
    }

    if (!isSoundFormat(media.format)) {
      this.logger.warn(
        { returned: media.format, requested: this.soundFormats },
        'Deezer did not report the media format; assuming the preferred one',
      );
      return { url, format: this.currentSoundFormat };
    }
    return { url, format: media.format };
  }

  public async downloadSong(song: DeezerSong, outputFile: string): Promise<DownloadedSong> {
    const { song: resolvedSong, source } = await this.resolveSource(song);
    const songId = resolvedSong.SNG_ID;

    await this.streamToFile(resolvedSong, source, outputFile);
    await this.tagSong(resolvedSong, source.format, outputFile);

    if (source.format !== this.currentSoundFormat) {
      this.logger.info(
        { songId, preferred: this.currentSoundFormat, actual: source.format },
        'song is not available in the preferred format; downloaded a lower quality',
      );
    }
    this.logger.info({ file: outputFile, songId, format: source.format }, 'download finished');
    return { format: source.format, extension: extensionForFormat(source.format) };
  }

  private async resolveSource(song: DeezerSong): Promise<{ song: DeezerSong; source: SongSource }> {
    try {
      return { song, source: await this.getSongUrl(song.TRACK_TOKEN) };
    } catch (error) {
      if (!song.FALLBACK) {
        throw error;
      }
      this.logger.warn({ songId: song.SNG_ID, err: error }, 'primary song unavailable, trying fallback');
      return { song: song.FALLBACK, source: await this.getSongUrl(song.FALLBACK.TRACK_TOKEN) };
    }
  }

  private async streamToFile(song: DeezerSong, source: SongSource, outputFile: string): Promise<void> {
    const key = calcBfKey(song.SNG_ID);
    try {
      await pipeline(this.http.stream(source.url), createDecryptTransform(key), createWriteStream(outputFile));
    } catch (error) {
      await rm(outputFile, { force: true }).catch(() => undefined);
      throw new DeezerApiException(
        `Could not write song to disk (${WEBSITE_URL}/track/${song.SNG_ID}): ${errorMessage(error)}`,
        { cause: error },
      );
    }
  }

  private async tagSong(song: DeezerSong, format: SoundFormat, outputFile: string): Promise<void> {
    const picture = await this.getCachedPicture(song.ALB_PICTURE);
    try {
      await writeSongMetadata(outputFile, song, {
        isFlac: format === 'FLAC',
        picture,
        metaflacPath: this.config.tools.metaflacPath,
      });
    } catch (error) {
      this.logger.warn({ err: error, file: outputFile, songId: song.SNG_ID }, 'could not write song metadata');
    }
  }

  private getCachedPicture(pictureId: string | undefined): Promise<Buffer | undefined> {
    if (!pictureId) {
      return Promise.resolve(undefined);
    }
    return this.pictures.get(pictureId, () =>
      this.downloadPicture(pictureId).catch((error: unknown) => {
        this.pictures.delete(pictureId);
        this.logger.warn({ err: error, pictureId }, 'could not download cover; tagging without it');
        return undefined;
      }),
    );
  }

  public async downloadPicture(pictureId: string): Promise<Buffer> {
    const url = `https://e-cdns-images.dzcdn.net/images/cover/${pictureId}/1200x1200.jpg`;
    const data = await describeFailure(`Could not download cover ${pictureId}`, () => this.http.get(url).buffer());
    return Buffer.from(data);
  }
}
