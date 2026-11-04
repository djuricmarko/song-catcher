import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

import got, { type Got } from 'got';
import type { Logger } from 'pino';
import { ProxyAgent } from 'proxy-agent';
import { CookieJar } from 'tough-cookie';

import type { AppConfig } from '../config/env.js';
import { calcBfKey, createDecryptTransform } from './crypto.js';
import { writeSongMetadata } from './metadata.js';
import {
  apiErrorText,
  errorMessage,
  extractAppState,
  extractPlaylistId,
  mapSearchResult,
  type AlbumContext,
  type DeezerApiError,
  type SearchResponse,
} from './parse.js';
import {
  TYPE_ALBUM,
  TYPE_ALBUM_TRACK,
  TYPE_ARTIST,
  TYPE_ARTIST_ALBUM,
  TYPE_ARTIST_TOP,
  TYPE_TRACK,
  type DeezerAppState,
  type DeezerSong,
  type PlaylistResult,
  type SearchResult,
  type SearchType,
  type WebsiteType,
} from './types.js';

const USER_AGENT = 'Mozilla/5.0 (X11; Linux i686; rv:135.0) Gecko/20100101 Firefox/135.0';
const GW_LIGHT_URL = 'https://www.deezer.com/ajax/gw-light.php';
const USER_DATA_URL = `${GW_LIGHT_URL}?method=deezer.getUserData&input=3&api_version=1.0&api_token=`;
const MEDIA_URL = 'https://media.deezer.com/v1/get_url';
const COVER_BASE = 'https://e-cdns-images.dzcdn.net/images/cover';
/** Covers are ~100-300 KB; keep enough for a few albums being downloaded in parallel. */
const PICTURE_CACHE_SIZE = 16;

export type SoundFormat = 'FLAC' | 'MP3_320' | 'MP3_128';

const SOUND_FORMATS: readonly SoundFormat[] = ['FLAC', 'MP3_320', 'MP3_128'];

export function extensionForFormat(format: SoundFormat): 'flac' | 'mp3' {
  return format === 'FLAC' ? 'flac' : 'mp3';
}

export interface SongSource {
  url: string;
  /** The format Deezer actually returned; may be lower than requested. */
  format: SoundFormat;
}

export interface DownloadedSong {
  format: SoundFormat;
  extension: 'flac' | 'mp3';
}

export class Deezer404Exception extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'Deezer404Exception';
  }
}

export class Deezer403Exception extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'Deezer403Exception';
  }
}

export class DeezerApiException extends Error {
  /** True when the failure looks like an expired session or license token. */
  public readonly sessionRelated: boolean;

  public constructor(message: string, options?: ErrorOptions & { sessionRelated?: boolean }) {
    super(message, options);
    this.name = 'DeezerApiException';
    this.sessionRelated = options?.sessionRelated ?? false;
  }
}

function isSessionError(error: unknown): boolean {
  return error instanceof Deezer403Exception || (error instanceof DeezerApiException && error.sessionRelated);
}

const SHORT_LINK_HOSTS = new Set(['link.deezer.com', 'deezer.page.link']);

/**
 * Only real Deezer short-link hosts are followed; a substring match would let
 * any URL containing "link.deezer.com" make the server send a request to it.
 */
export function isDeezerShortLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && SHORT_LINK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Don't hammer Deezer when many songs fail for a reason a refresh can't fix. */
const SESSION_REFRESH_INTERVAL_MS = 60_000;

interface WebSoundQuality {
  high?: boolean;
  lossless?: boolean;
}

interface UserDataResults {
  checkForm?: string;
  USER?: {
    OPTIONS?: {
      license_token?: string;
      web_hq?: boolean;
      web_sound_quality?: WebSoundQuality;
    };
  };
}

interface UserDataResponse {
  results?: UserDataResults;
}

interface PlaylistResponse {
  error?: unknown[];
  results?: {
    DATA?: {
      TITLE?: string;
      NB_SONG?: number;
    };
    SONGS?: {
      count?: number;
      data?: DeezerSong[];
    };
  };
}

interface FavoritesResponse {
  data?: Array<{ id: number }>;
  total?: number;
  next?: string;
  error?: DeezerApiError | string;
}

interface GetUrlSource {
  url?: string;
}

interface GetUrlMedia {
  format?: string;
  sources?: GetUrlSource[];
}

interface GetUrlEntry {
  errors?: Array<{ message?: string }>;
  media?: GetUrlMedia[];
}

interface GetUrlResponse {
  data?: GetUrlEntry[];
}

export class DeezerClient {
  private readonly http: Got;
  private readonly jar: CookieJar;
  private licenseToken = '';
  /** Formats to request, best first; Deezer returns the best one available per track. */
  private soundFormats: SoundFormat[] = ['MP3_128'];
  private initialized = false;
  private lastInitAt = 0;
  private refreshing: Promise<boolean> | undefined;
  private readonly pictureCache = new Map<string, Promise<Buffer | undefined>>();

  public constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    this.jar = new CookieJar();

    const headers: Record<string, string> = {
      'user-agent': USER_AGENT,
      pragma: 'no-cache',
      origin: 'https://www.deezer.com',
      'accept-language': 'en-US,en;q=0.9',
      accept: '*/*',
      'cache-control': 'no-cache',
      'x-requested-with': 'XMLHttpRequest',
      referer: 'https://www.deezer.com/login',
      dnt: '1',
    };

    const proxyUrl = config.deezer.proxyUrl.trim();
    const proxyAgent = proxyUrl ? new ProxyAgent({ getProxyForUrl: () => proxyUrl }) : undefined;

    this.http = got.extend({
      cookieJar: this.jar,
      headers,
      timeout: { response: 30_000, socket: 60_000 },
      retry: { limit: 0 },
      followRedirect: true,
      ...(proxyAgent
        ? {
            agent: {
              http: proxyAgent,
              https: proxyAgent,
            },
          }
        : {}),
    });
  }

  public get isInitialized(): boolean {
    return this.initialized;
  }

  /** The preferred format; individual tracks may fall back to a lower one. */
  public get currentSoundFormat(): SoundFormat {
    return this.soundFormats[0] ?? 'MP3_128';
  }

  public get fileExtension(): 'flac' | 'mp3' {
    return extensionForFormat(this.currentSoundFormat);
  }

  public async init(): Promise<void> {
    await this.setCookies();
    const userData = await this.getUserData();
    this.licenseToken = userData.licenseToken;
    this.setSongQuality(userData.webSoundQuality, userData.webHq);
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

  private async setCookies(): Promise<void> {
    try {
      await this.jar.setCookie(
        `arl=${this.config.deezer.cookieArl}; Domain=.deezer.com; Path=/`,
        'https://www.deezer.com/',
      );
      await this.jar.setCookie('comeback=1; Domain=.deezer.com; Path=/', 'https://www.deezer.com/');
    } catch (error) {
      throw new DeezerApiException(`Could not set the Deezer ARL cookie: ${errorMessage(error)}`, {
        cause: error,
      });
    }
  }

  private async getUserData(): Promise<{
    licenseToken: string;
    webSoundQuality: WebSoundQuality;
    webHq: boolean;
  }> {
    let body: UserDataResponse;
    try {
      body = await this.http.get(USER_DATA_URL).json<UserDataResponse>();
    } catch (error) {
      throw new DeezerApiException(`Could not retrieve the Deezer license token: ${errorMessage(error)}`, {
        cause: error,
      });
    }

    const options = body.results?.USER?.OPTIONS;
    const licenseToken = options?.license_token;
    const webSoundQuality = options?.web_sound_quality;
    if (!licenseToken || !webSoundQuality) {
      throw new DeezerApiException('Could not retrieve the Deezer license token. Is DEEZER_COOKIE_ARL still valid?');
    }

    return { licenseToken, webSoundQuality, webHq: options.web_hq === true };
  }

  /**
   * Re-reads the user data (license token, session cookies). Concurrent
   * callers share one refresh, and refreshes are rate-limited. Resolves to
   * true when the session was refreshed and the caller should retry.
   */
  private refreshSession(): Promise<boolean> {
    if (this.refreshing) {
      return this.refreshing;
    }
    if (Date.now() - this.lastInitAt < SESSION_REFRESH_INTERVAL_MS) {
      return Promise.resolve(false);
    }

    this.logger.info('Deezer session looks expired; refreshing it');
    this.refreshing = this.init()
      .then(() => true)
      .catch((error: unknown) => {
        // Still rate-limit: a dead ARL would otherwise be retried per song.
        this.lastInitAt = Date.now();
        this.logger.error({ err: error }, 'could not refresh the Deezer session');
        return false;
      })
      .finally(() => {
        this.refreshing = undefined;
      });
    return this.refreshing;
  }

  /** Runs `operation`, refreshing the session and retrying once on session errors. */
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

  private setSongQuality(webSoundQuality: WebSoundQuality, webHq: boolean): void {
    const lossless = webSoundQuality.lossless === true;
    const high = lossless || webSoundQuality.high === true || webHq;

    if (this.config.deezer.quality === 'flac' && !lossless) {
      this.logger.warn(
        'DEEZER_QUALITY=flac is configured, but the Deezer account does not support lossless. Falling back to mp3.',
      );
    }

    if (this.config.deezer.quality === 'flac' && lossless) {
      this.soundFormats = ['FLAC', 'MP3_320', 'MP3_128'];
    } else if (high) {
      this.soundFormats = ['MP3_320', 'MP3_128'];
    } else {
      this.soundFormats = ['MP3_128'];
    }
  }

  public async getSongInfosFromWebsite(searchType: typeof TYPE_TRACK, id: string | number): Promise<DeezerSong>;
  public async getSongInfosFromWebsite(
    searchType: typeof TYPE_ALBUM | 'playlist',
    id: string | number,
  ): Promise<DeezerSong[]>;
  public async getSongInfosFromWebsite(
    searchType: WebsiteType,
    id: string | number,
  ): Promise<DeezerSong | DeezerSong[]> {
    const state = await this.fetchWebsiteState(searchType, id);

    if (state.DATA?.__TYPE__ === 'playlist' || state.DATA?.__TYPE__ === 'album') {
      const albumArtist = state.DATA.ART_NAME?.trim() ?? '';
      const releaseDate = state.DATA.PHYSICAL_RELEASE_DATE;
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

    if (state.DATA?.__TYPE__ === 'song') {
      const song = state.DATA as unknown as DeezerSong;
      if (song.ALB_ID) {
        try {
          const albumState = await this.fetchWebsiteState(TYPE_ALBUM, song.ALB_ID);
          song.ALB_ART_NAME = albumState.DATA?.ART_NAME || song.ART_NAME;
          if (albumState.DATA?.PHYSICAL_RELEASE_DATE) {
            song.PHYSICAL_RELEASE_DATE = albumState.DATA.PHYSICAL_RELEASE_DATE;
          }
        } catch (error) {
          this.logger.warn({ err: error, songId: song.SNG_ID }, 'Could not retrieve the album artist for a track');
        }
      }
      return searchType === TYPE_TRACK ? song : [song];
    }

    throw new DeezerApiException(
      `Unexpected Deezer page type '${state.DATA?.__TYPE__ ?? 'unknown'}' for ${searchType}/${id}`,
    );
  }

  private fetchWebsiteState(searchType: WebsiteType, id: string | number): Promise<DeezerAppState> {
    return this.withSessionRetry(() => this.fetchWebsiteStateOnce(searchType, id));
  }

  private async fetchWebsiteStateOnce(searchType: WebsiteType, id: string | number): Promise<DeezerAppState> {
    const url = `https://www.deezer.com/us/${searchType}/${id}`;
    let response: { statusCode: number; body: string };
    try {
      response = await this.http.get(url, {
        throwHttpErrors: false,
        responseType: 'text',
      });
    } catch (error) {
      throw new DeezerApiException(`Could not open ${url}: ${errorMessage(error)}`, {
        cause: error,
      });
    }

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
    if (
      ![TYPE_TRACK, TYPE_ALBUM, TYPE_ARTIST, TYPE_ALBUM_TRACK, TYPE_ARTIST_ALBUM, TYPE_ARTIST_TOP].includes(searchType)
    ) {
      throw new DeezerApiException(`Unsupported search type: ${searchType}`);
    }

    const encodedSearch = new URLSearchParams({ q: search }).toString();
    const encodedId = encodeURIComponent(search);
    let url: string;
    if (searchType === TYPE_ALBUM_TRACK) {
      url = `https://api.deezer.com/album/${encodedId}`;
    } else if (searchType === TYPE_ARTIST_TOP) {
      url = `https://api.deezer.com/artist/${encodedId}/top?limit=20`;
    } else if (searchType === TYPE_ARTIST_ALBUM) {
      url = `https://api.deezer.com/artist/${encodedId}/albums`;
    } else {
      url = `https://api.deezer.com/search/${searchType}?${encodedSearch}`;
    }

    let body: SearchResponse;
    try {
      body = await this.http.get(url).json<SearchResponse>();
    } catch (error) {
      throw new DeezerApiException(`Could not search for music: ${errorMessage(error)}`, {
        cause: error,
      });
    }

    if (body.error) {
      throw new DeezerApiException(`Deezer search failed: ${apiErrorText(body.error)}`);
    }

    const data = searchType === TYPE_ALBUM_TRACK ? (body.tracks?.data ?? []) : (body.data ?? []);
    // For album tracks the album itself is the response body.
    const albumContext = searchType === TYPE_ALBUM_TRACK ? (body as AlbumContext) : undefined;

    return data.flatMap((item) => mapSearchResult(item, searchType, albumContext) ?? []);
  }

  public async parseDeezerPlaylist(playlistIdOrUrl: string): Promise<PlaylistResult> {
    let value = playlistIdOrUrl.trim();

    if (isDeezerShortLink(value)) {
      try {
        const response = await this.http.head(value, {
          followRedirect: true,
          throwHttpErrors: false,
          timeout: { request: 10_000 },
        });
        value = response.url;
      } catch (error) {
        throw new DeezerApiException(`Could not resolve short link '${playlistIdOrUrl}': ${errorMessage(error)}`, {
          cause: error,
        });
      }
    }

    const playlistId = extractPlaylistId(value);
    if (!playlistId) {
      throw new DeezerApiException(`Could not extract a playlist id from '${playlistIdOrUrl}'`);
    }

    const csrfToken = await this.getCsrfToken();
    const url = `${GW_LIGHT_URL}?method=deezer.pagePlaylist&input=3&api_version=1.0&api_token=${encodeURIComponent(csrfToken)}`;

    let body: PlaylistResponse;
    try {
      body = await this.http
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
        .json<PlaylistResponse>();
    } catch (error) {
      throw new DeezerApiException(`Could not load Deezer playlist ${playlistId}: ${errorMessage(error)}`, {
        cause: error,
      });
    }

    if (body.error && body.error.length > 0) {
      throw new DeezerApiException(`Deezer API said: ${JSON.stringify(body.error)}`);
    }

    const data = body.results?.DATA;
    const songs = body.results?.SONGS;
    if (!data?.TITLE || !songs) {
      throw new DeezerApiException(`Deezer returned no data for playlist ${playlistId}`);
    }

    this.logger.info(
      {
        playlist: data.TITLE,
        totalSongs: data.NB_SONG,
        returnedSongs: songs.count,
      },
      'fetched Deezer playlist',
    );

    return { name: data.TITLE, songs: songs.data ?? [] };
  }

  private async getCsrfToken(): Promise<string> {
    try {
      const body = await this.http.post(USER_DATA_URL).json<UserDataResponse>();
      const token = body.results?.checkForm;
      if (!token) {
        throw new DeezerApiException('Deezer did not return a CSRF token');
      }
      return token;
    } catch (error) {
      if (error instanceof DeezerApiException) {
        throw error;
      }
      throw new DeezerApiException(`Could not retrieve a Deezer CSRF token: ${errorMessage(error)}`, {
        cause: error,
      });
    }
  }

  public async getDeezerFavorites(userId: string): Promise<string[]> {
    if (!/^\d+$/.test(userId)) {
      throw new DeezerApiException(`User id '${userId}' must be numeric`);
    }

    const ids: string[] = [];
    let url: string | undefined = `https://api.deezer.com/user/${userId}/tracks?limit=10000000000`;
    let total = 0;

    for (let page = 0; url && page < 1000; page += 1) {
      let body: FavoritesResponse;
      try {
        body = await this.http.get(url).json<FavoritesResponse>();
      } catch (error) {
        throw new DeezerApiException(`Could not retrieve favorite songs for user ${userId}: ${errorMessage(error)}`, {
          cause: error,
        });
      }
      if (body.error) {
        throw new DeezerApiException(`Upstream API error for user ${userId}: ${apiErrorText(body.error)}`);
      }

      for (const song of body.data ?? []) {
        ids.push(String(song.id));
      }
      total = body.total ?? total;
      url = body.next;
    }

    this.logger.info({ userId, total, fetched: ids.length }, 'fetched Deezer favorites');
    return ids;
  }

  public getSongUrl(trackToken: string): Promise<SongSource> {
    return this.withSessionRetry(() => this.getSongUrlOnce(trackToken));
  }

  private async getSongUrlOnce(trackToken: string): Promise<SongSource> {
    let response: { statusCode: number; body: unknown };
    try {
      response = await this.http.post(MEDIA_URL, {
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
      });
    } catch (error) {
      throw new DeezerApiException(`Could not retrieve song URL: ${errorMessage(error)}`, {
        cause: error,
      });
    }

    const body = response.body as GetUrlResponse;
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

    const format = SOUND_FORMATS.find((candidate) => candidate === media?.format);
    if (!format) {
      this.logger.warn(
        { returned: media?.format, requested: this.soundFormats },
        'Deezer did not report the media format; assuming the preferred one',
      );
    }
    return { url, format: format ?? this.currentSoundFormat };
  }

  /**
   * Downloads and tags a song. The returned format tells the caller which
   * extension the file needs, since Deezer may fall back to a lower quality.
   */
  public async downloadSong(song: DeezerSong, outputFile: string): Promise<DownloadedSong> {
    let resolvedSong = song;
    let source: SongSource;

    try {
      source = await this.getSongUrl(resolvedSong.TRACK_TOKEN);
    } catch (error) {
      if (!resolvedSong.FALLBACK) {
        throw error;
      }
      this.logger.warn({ songId: resolvedSong.SNG_ID, err: error }, 'primary song unavailable, trying fallback');
      resolvedSong = resolvedSong.FALLBACK;
      source = await this.getSongUrl(resolvedSong.TRACK_TOKEN);
    }

    const key = calcBfKey(resolvedSong.SNG_ID);
    try {
      await pipeline(this.http.stream(source.url), createDecryptTransform(key), createWriteStream(outputFile));
    } catch (error) {
      await rm(outputFile, { force: true }).catch(() => undefined);
      throw new DeezerApiException(
        `Could not write song to disk (https://www.deezer.com/track/${resolvedSong.SNG_ID}): ${errorMessage(error)}`,
        { cause: error },
      );
    }

    // A missing cover must not prevent the title/artist/album tags.
    const picture = await this.getCachedPicture(resolvedSong.ALB_PICTURE);
    try {
      await writeSongMetadata(outputFile, resolvedSong, {
        isFlac: source.format === 'FLAC',
        picture,
        metaflacPath: this.config.tools.metaflacPath,
      });
    } catch (error) {
      this.logger.warn({ err: error, file: outputFile, songId: resolvedSong.SNG_ID }, 'could not write song metadata');
    }

    if (source.format !== this.currentSoundFormat) {
      this.logger.info(
        { songId: resolvedSong.SNG_ID, preferred: this.currentSoundFormat, actual: source.format },
        'song is not available in the preferred format; downloaded a lower quality',
      );
    }
    this.logger.info({ file: outputFile, songId: resolvedSong.SNG_ID, format: source.format }, 'download finished');
    return { format: source.format, extension: extensionForFormat(source.format) };
  }

  /**
   * Returns the album cover, or undefined if it cannot be downloaded. Covers
   * are cached by picture id so an album fetches its cover only once; the
   * in-flight promise is cached so concurrent workers share one request.
   */
  private getCachedPicture(pictureId: string | undefined): Promise<Buffer | undefined> {
    if (!pictureId) {
      return Promise.resolve(undefined);
    }
    const cached = this.pictureCache.get(pictureId);
    if (cached) {
      // Refresh recency for LRU eviction.
      this.pictureCache.delete(pictureId);
      this.pictureCache.set(pictureId, cached);
      return cached;
    }

    const pending = this.downloadPicture(pictureId).catch((error: unknown) => {
      this.pictureCache.delete(pictureId);
      this.logger.warn({ err: error, pictureId }, 'could not download cover; tagging without it');
      return undefined;
    });
    this.pictureCache.set(pictureId, pending);
    while (this.pictureCache.size > PICTURE_CACHE_SIZE) {
      const oldest = this.pictureCache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.pictureCache.delete(oldest);
    }
    return pending;
  }

  public async downloadPicture(pictureId: string): Promise<Buffer> {
    const url = `${COVER_BASE}/${pictureId}/1200x1200.jpg`;
    try {
      const data = await this.http.get(url).buffer();
      return Buffer.from(data);
    } catch (error) {
      throw new DeezerApiException(`Could not download cover ${pictureId}: ${errorMessage(error)}`, { cause: error });
    }
  }

  public async testLogin(): Promise<boolean> {
    try {
      const song = await this.getSongInfosFromWebsite(TYPE_TRACK, '917265');
      this.logger.info({ songId: song.SNG_ID }, 'Deezer login is working');
      return true;
    } catch (error) {
      this.logger.warn({ err: error }, 'Deezer login check failed');
      return false;
    }
  }
}
