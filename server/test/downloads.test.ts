import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadConfig, type AppConfig } from '../src/config/env.js';
import type { DeezerSong } from '../src/deezer/types.js';
import { DownloadError, DownloadService, type DeezerService } from '../src/downloads/service.js';
import { downloadWithYtDlp, parseYtDlpOutput } from '../src/downloads/youtube.js';

const ARL = 'a'.repeat(192);
const logger = pino({ level: 'silent' });

function makeSong(overrides: Partial<DeezerSong> = {}): DeezerSong {
  return {
    SNG_ID: '1',
    SNG_TITLE: 'Song',
    ART_NAME: 'Artist',
    ALB_TITLE: 'Album',
    ALB_PICTURE: 'cover',
    ALB_ART_NAME: 'Album Artist',
    TRACK_NUMBER: '1',
    DISK_NUMBER: '1',
    TRACK_TOKEN: 'token',
    MD5_ORIGIN: 'origin',
    ...overrides,
  };
}

let baseDirectory: string;
let config: AppConfig;

beforeEach(async () => {
  baseDirectory = await mkdtemp(path.join(tmpdir(), 'deezer-download-test-'));
  config = loadConfig(
    {
      DEEZER_COOKIE_ARL: ARL,
      DEEZER_DOWNLOAD_DIR: baseDirectory,
      DEEZER_MPD_ENABLED: 'false',
    },
    { cwd: baseDirectory },
  );
});

afterEach(async () => {
  await rm(baseDirectory, { recursive: true, force: true });
});

function makeService(overrides: Partial<DeezerService> = {}) {
  const downloadSong = vi.fn(async (_song: DeezerSong, outputFile: string) => {
    await writeFile(outputFile, 'audio');
  });
  const service: DeezerService = {
    deezerSearch: async () => [],
    parseDeezerPlaylist: async () => ({ name: 'Playlist', songs: [] }),
    getDeezerFavorites: async () => [],
    getSongInfosFromWebsite: async () => makeSong(),
    downloadSong,
    downloadPicture: async () => Buffer.from('cover'),
    testLogin: async () => true,
    fileExtension: 'mp3',
    ...overrides,
  } as unknown as DeezerService;
  return { service, downloadSong };
}

describe('DownloadService', () => {
  it('downloads a single track into the songs directory', async () => {
    const { service } = makeService();
    const downloads = new DownloadService(config, service, logger);

    const files = await downloads.downloadTrack('1', false);

    expect(files).toHaveLength(1);
    expect(files[0]).toBe(path.join(baseDirectory, 'songs', 'Artist - Song.mp3'));
    expect(await readFile(files[0]!, 'utf8')).toBe('audio');
  });

  it('skips files that already exist', async () => {
    const { service, downloadSong } = makeService();
    const downloads = new DownloadService(config, service, logger);
    const existing = path.join(baseDirectory, 'songs', 'Artist - Song.mp3');
    await mkdir(path.dirname(existing), { recursive: true });
    await writeFile(existing, 'existing');

    const files = await downloads.downloadTrack('1', false);

    expect(files).toEqual([existing]);
    expect(downloadSong).not.toHaveBeenCalled();
  });

  it('downloads an album with numbered files', async () => {
    const songs = [
      makeSong({ SNG_ID: '1', TRACK_NUMBER: '1', SNG_TITLE: 'First' }),
      makeSong({ SNG_ID: '2', TRACK_NUMBER: '2', SNG_TITLE: 'Second' }),
    ];
    const { service } = makeService({
      getSongInfosFromWebsite: async () => songs,
    } as unknown as Partial<DeezerService>);
    const downloads = new DownloadService(config, service, logger);

    const progress: Array<[number, number]> = [];
    const files = await downloads.downloadAlbum('10', false, false, (current, maximum) => {
      progress.push([current, maximum]);
    });

    expect(files).toEqual([
      path.join(baseDirectory, 'albums', 'Album Artist - Album', '01 - Artist First.mp3'),
      path.join(baseDirectory, 'albums', 'Album Artist - Album', '02 - Artist Second.mp3'),
    ]);
    expect(progress.at(-1)).toEqual([2, 2]);
  });

  it('creates an m3u8 file for playlists', async () => {
    const songs = [
      makeSong({ SNG_ID: '1', SNG_TITLE: 'First' }),
      makeSong({ SNG_ID: '2', SNG_TITLE: 'Second' }),
    ];
    const { service } = makeService({
      parseDeezerPlaylist: async () => ({ name: 'My Playlist', songs }),
    } as unknown as Partial<DeezerService>);
    const downloads = new DownloadService(config, service, logger);

    const files = await downloads.downloadPlaylist('playlist-url', false, false);
    const m3u8 = files.at(-1)!;

    expect(m3u8).toBe(path.join(baseDirectory, 'playlists', 'My Playlist', '00 My Playlist.m3u8'));
    expect(await readFile(m3u8, 'utf8')).toBe('Artist - First.mp3\nArtist - Second.mp3\n');
  });

  it('creates a zip archive when requested', async () => {
    const songs = [makeSong({ SNG_ID: '1', SNG_TITLE: 'First' })];
    const { service } = makeService({
      parseDeezerPlaylist: async () => ({ name: 'My Playlist', songs }),
    } as unknown as Partial<DeezerService>);
    const downloads = new DownloadService(config, service, logger);

    const files = await downloads.downloadPlaylist('playlist-url', false, true);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe(path.join(baseDirectory, 'zips', 'My Playlist.zip'));
    expect((await stat(files[0]!)).size).toBeGreaterThan(0);
  });

  it('downloads favorites into a favorites playlist', async () => {
    const { service } = makeService({
      getDeezerFavorites: async () => ['1', '2'],
      getSongInfosFromWebsite: async (_type: unknown, id: string | number) =>
        makeSong({ SNG_ID: String(id), SNG_TITLE: `Song ${id}` }),
    } as unknown as Partial<DeezerService>);
    const downloads = new DownloadService(config, service, logger);

    const files = await downloads.downloadFavorites('123', false, false);

    expect(files).toHaveLength(3);
    expect(files[0]).toBe(
      path.join(baseDirectory, 'playlists', 'favorites_123', 'Artist - Song 1.mp3'),
    );
    expect(files.at(-1)).toBe(
      path.join(baseDirectory, 'playlists', 'favorites_123', '00 favorites_123.m3u8'),
    );
  });

  it('fails clearly instead of creating empty playlists and zips', async () => {
    const { service } = makeService({
      parseDeezerPlaylist: async () => ({ name: 'Empty', songs: [] }),
    } as unknown as Partial<DeezerService>);
    const downloads = new DownloadService(config, service, logger);

    await expect(downloads.downloadPlaylist('playlist-url', false, false)).rejects.toBeInstanceOf(
      DownloadError,
    );
    await expect(downloads.createM3u8File([])).rejects.toThrowError(/without songs/);
    await expect(downloads.createZipFile([])).rejects.toThrowError(/without songs/);
  });
});

describe('yt-dlp wrapper', () => {
  it('parses the printed output path', () => {
    expect(parseYtDlpOutput('some log\n/tmp/video.mp3\n')).toBe('/tmp/video.mp3');
    expect(parseYtDlpOutput('[ExtractAudio] Destination: /tmp/video.mp3\n')).toBe('/tmp/video.mp3');
  });

  it('downloads through an executable', async () => {
    const scriptPath = path.join(baseDirectory, 'fake-ytdlp.sh');
    await writeFile(
      scriptPath,
      `#!/bin/sh
out=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    *) shift ;;
  esac
done
out=$(printf '%s' "$out" | sed 's/%(title)s.%(ext)s/video.mp3/')
printf 'audio' > "$out"
printf '%s\\n' "$out"
`,
    );
    await chmod(scriptPath, 0o755);

    const directory = path.join(baseDirectory, 'youtube');
    await mkdir(directory, { recursive: true });

    const filename = await downloadWithYtDlp({
      url: 'https://example.com/video',
      destinationDirectory: directory,
      executable: scriptPath,
    });

    expect(filename).toBe(path.join(directory, 'video.mp3'));
    expect(await readFile(filename, 'utf8')).toBe('audio');
  });
});
