import { chmod, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { TaskMedia } from '@song-catcher/shared';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadConfig, type AppConfig } from '../src/config/env.js';
import type { DeezerSong } from '../src/deezer/types.js';
import { YOUTUBE_PLAYLIST_MANIFEST } from '../src/downloads/playlist-manifest.js';
import { DownloadError, DownloadService, type DeezerService } from '../src/downloads/service.js';
import {
  downloadWithYtDlp,
  listYtDlpPlaylist,
  parseYtDlpInfo,
  parseYtDlpOutput,
  parseYtDlpPlaylist,
  parseYtDlpTransfer,
  type YoutubeVideoInfo,
} from '../src/downloads/youtube.js';
import type { TransferReporter, TransferSample } from '../src/lib/transfer.js';

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
  const downloadSong = vi.fn(async (_song: DeezerSong, outputFile: string, _onTransfer?: TransferReporter) => {
    await writeFile(outputFile, 'audio');
    return { format: 'MP3_128' as const, extension: 'mp3' as const };
  });
  const service: DeezerService = {
    deezerSearch: async () => [],
    parseDeezerPlaylist: async () => ({ name: 'Playlist', songs: [] }),
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
  it('names the file after the format Deezer actually returned', async () => {
    const { service } = makeService({
      fileExtension: 'flac',
      downloadSong: async (_song: DeezerSong, outputFile: string) => {
        await writeFile(outputFile, 'audio');
        return { format: 'MP3_320', extension: 'mp3' };
      },
    });
    const downloads = new DownloadService(config, service, logger);

    const files = await downloads.downloadTrack('1', false);

    expect(files).toEqual([path.join(baseDirectory, 'songs', 'Artist - Song.mp3')]);
    expect(await readFile(files[0]!, 'utf8')).toBe('audio');
  });

  it('downloads a single track into the songs directory', async () => {
    const { service, downloadSong } = makeService();
    const downloads = new DownloadService(config, service, logger);

    const media: Array<Partial<TaskMedia>> = [];
    const reportTransfer = vi.fn();
    const files = await downloads.downloadTrack('1', false, {
      reportMedia: (reported) => media.push(reported),
      reportTransfer,
    });

    expect(media).toEqual([{ title: 'Artist - Song', subtitle: 'Album' }]);
    expect(downloadSong.mock.calls[0]?.[2]).toBe(reportTransfer);
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
    const media: Array<Partial<TaskMedia>> = [];
    const files = await downloads.downloadAlbum('10', false, {
      reportProgress: (current, maximum) => progress.push([current, maximum]),
      reportMedia: (reported) => media.push(reported),
    });

    expect(media).toEqual([{ title: 'Album', subtitle: 'Album Artist' }]);
    expect(files).toEqual([
      path.join(baseDirectory, 'albums', 'Album Artist - Album', '01 - Artist First.mp3'),
      path.join(baseDirectory, 'albums', 'Album Artist - Album', '02 - Artist Second.mp3'),
    ]);
    expect(progress.at(-1)).toEqual([2, 2]);
  });

  it('reports songs that failed while the rest of the album succeeds', async () => {
    const { service } = makeService({
      getSongInfosFromWebsite: (async () => [
        makeSong({ SNG_ID: '1', SNG_TITLE: 'Good', TRACK_NUMBER: '1' }),
        makeSong({ SNG_ID: '2', SNG_TITLE: 'Bad', TRACK_NUMBER: '2' }),
      ]) as unknown as DeezerService['getSongInfosFromWebsite'],
      downloadSong: async (song: DeezerSong, outputFile: string) => {
        if (song.SNG_ID === '2') {
          throw new Error('not available in your country');
        }
        await writeFile(outputFile, 'audio');
        return { format: 'MP3_128', extension: 'mp3' };
      },
    });
    const downloads = new DownloadService(config, service, logger);
    const warnings: string[] = [];

    const files = await downloads.downloadAlbum('1', false, {
      reportWarning: (message) => warnings.push(message),
    });

    expect(files).toHaveLength(1);
    expect(warnings).toEqual(['Could not download "Artist - Bad": not available in your country']);
  });

  it('creates an m3u8 file for playlists', async () => {
    const songs = [makeSong({ SNG_ID: '1', SNG_TITLE: 'First' }), makeSong({ SNG_ID: '2', SNG_TITLE: 'Second' })];
    const { service } = makeService({
      parseDeezerPlaylist: async () => ({ name: 'My Playlist', songs }),
    } as unknown as Partial<DeezerService>);
    const downloads = new DownloadService(config, service, logger);

    const media: Array<Partial<TaskMedia>> = [];
    const files = await downloads.downloadPlaylist('playlist-url', false, {
      reportMedia: (reported) => media.push(reported),
    });
    const m3u8 = files.at(-1)!;

    expect(media).toEqual([{ title: 'My Playlist', subtitle: '2 songs' }]);
    expect(m3u8).toBe(path.join(baseDirectory, 'playlists', 'My Playlist', '00 My Playlist.m3u8'));
    expect(await readFile(m3u8, 'utf8')).toBe('Artist - First.mp3\nArtist - Second.mp3\n');
  });

  it('fails clearly instead of creating empty playlists', async () => {
    const { service } = makeService({
      parseDeezerPlaylist: async () => ({ name: 'Empty', songs: [] }),
    } as unknown as Partial<DeezerService>);
    const downloads = new DownloadService(config, service, logger);

    await expect(downloads.downloadPlaylist('playlist-url', false)).rejects.toBeInstanceOf(DownloadError);
    await expect(downloads.createM3u8File([])).rejects.toThrowError(/without songs/);
  });
});

describe('yt-dlp wrapper', () => {
  it('parses the printed output path', () => {
    expect(parseYtDlpOutput('some log\n"/tmp/video.mp3"\n')).toBe('/tmp/video.mp3');
    expect(parseYtDlpOutput(String.raw`"C:\\Music\\Ambience \u2022 Gryffindor \uff5c 4 hours.mp3"` + '\r\n')).toBe(
      'C:\\Music\\Ambience • Gryffindor ｜ 4 hours.mp3',
    );
    expect(parseYtDlpOutput('/tmp/video.mp3\n')).toBeUndefined();
    expect(parseYtDlpOutput('[ExtractAudio] Destination: /tmp/video.mp3\n')).toBe('/tmp/video.mp3');
  });

  it('reads the video title and upload date from the info line', () => {
    expect(parseYtDlpInfo('{"title": "Pantera - Walk", "upload_date": "20091003"}')).toEqual({
      title: 'Pantera - Walk',
      uploadDate: '2009-10-03',
    });
    expect(parseYtDlpInfo('{"title": "Live set", "upload_date": null}')).toEqual({
      title: 'Live set',
      uploadDate: undefined,
    });
    expect(parseYtDlpInfo('/tmp/video.mp3')).toBeUndefined();
    expect(parseYtDlpInfo('{broken')).toBeUndefined();
    expect(parseYtDlpInfo('{"upload_date": "20091003"}')).toBeUndefined();
  });

  it('reads the downloaded bytes from the progress line', () => {
    expect(parseYtDlpTransfer('[transfer] 1024 252182')).toEqual({ transferred: 1024, total: 252182 });
    expect(parseYtDlpTransfer('[transfer] 1024 5000.5')).toEqual({ transferred: 1024, total: 5000.5 });
    expect(parseYtDlpTransfer('[transfer] 1024 NA')).toEqual({ transferred: 1024, total: undefined });
    expect(parseYtDlpTransfer('[transfer] NA NA')).toBeUndefined();
    expect(parseYtDlpTransfer('/tmp/video.mp3')).toBeUndefined();
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
printf '%s\\n' '{"title": "Video", "upload_date": "20240930"}'
printf '%s\\n' '[transfer] 1024 5120' '[transfer] 5120 5120' '[transfer] 5120 5120'
printf '%s\\n' '[convert] ExtractAudio' >&2
printf 'audio' > "$out"
printf '"%s"\\n' "$out"
`,
    );
    await chmod(scriptPath, 0o755);

    const directory = path.join(baseDirectory, 'youtube');
    await mkdir(directory, { recursive: true });

    const infos: YoutubeVideoInfo[] = [];
    const samples: TransferSample[] = [];
    const filename = await downloadWithYtDlp({
      url: 'https://example.com/video',
      destinationDirectory: directory,
      executable: scriptPath,
      onInfo: (info) => infos.push(info),
      onTransfer: (sample) => samples.push(sample),
    });

    expect(infos).toEqual([{ title: 'Video', uploadDate: '2024-09-30' }]);
    expect(samples.reduce((total, sample) => total + sample.bytes, 0)).toBe(4096);
    const fractions = samples.map((sample) => sample.fraction);
    expect(fractions.filter((fraction) => fraction !== null)).toEqual([0.2, 1, 1]);
    expect(fractions).toContain(null);
    expect(filename).toBe(path.join(directory, 'video.mp3'));
    expect(await readFile(filename, 'utf8')).toBe('audio');
  });

  it('passes the URL after -- and disables playlists', async () => {
    const scriptPath = path.join(baseDirectory, 'args-ytdlp.sh');
    const argsFile = path.join(baseDirectory, 'args.txt');
    await writeFile(
      scriptPath,
      `#!/bin/sh
for arg in "$@"; do printf '%s\\n' "$arg" >> "${argsFile}"; done
printf 'audio' > "${baseDirectory}/v.mp3"
printf '"%s"\\n' "${baseDirectory}/v.mp3"
`,
    );
    await chmod(scriptPath, 0o755);

    await downloadWithYtDlp({
      url: 'https://example.com/watch?v=1&list=2',
      destinationDirectory: baseDirectory,
      executable: scriptPath,
    });

    const args = (await readFile(argsFile, 'utf8')).trim().split('\n');
    expect(args).toContain('--no-playlist');
    expect(args.slice(-2)).toEqual(['--', 'https://example.com/watch?v=1&list=2']);
  });

  it('escapes percent signs in the destination directory', async () => {
    const scriptPath = path.join(baseDirectory, 'percent-ytdlp.sh');
    const argsFile = path.join(baseDirectory, 'percent-args.txt');
    await writeFile(
      scriptPath,
      `#!/bin/sh
for arg in "$@"; do printf '%s\\n' "$arg" >> "${argsFile}"; done
printf 'audio' > "${baseDirectory}/p.mp3"
printf '"%s"\\n' "${baseDirectory}/p.mp3"
`,
    );
    await chmod(scriptPath, 0o755);

    await downloadWithYtDlp({
      url: 'https://example.com/video',
      destinationDirectory: path.join(baseDirectory, '100% hits'),
      executable: scriptPath,
    });

    const args = (await readFile(argsFile, 'utf8')).trim().split('\n');
    expect(args[args.indexOf('-o') + 1]).toBe(path.join(baseDirectory, '100%% hits', '%(title)s.%(ext)s'));
  });

  it('kills yt-dlp after the timeout', async () => {
    const scriptPath = path.join(baseDirectory, 'slow-ytdlp.sh');
    await writeFile(scriptPath, '#!/bin/sh\nsleep 10\n');
    await chmod(scriptPath, 0o755);

    const started = Date.now();
    await expect(
      downloadWithYtDlp({
        url: 'https://example.com/video',
        destinationDirectory: baseDirectory,
        executable: scriptPath,
        timeoutMs: 100,
      }),
    ).rejects.toThrowError(/did not finish within/);
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});

describe('yt-dlp playlist listing', () => {
  const entry = (id: string, title = `Title ${id}`) => ({
    _type: 'url',
    id,
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
  });

  it('parses the entries of a flat playlist', () => {
    const playlist = parseYtDlpPlaylist(
      JSON.stringify({ _type: 'playlist', id: 'PL1', title: ' Road trip ', entries: [entry('a'), entry('b')] }),
      10,
    );

    expect(playlist).toEqual({
      title: 'Road trip',
      truncated: false,
      entries: [
        { id: 'a', title: 'Title a', url: 'https://www.youtube.com/watch?v=a' },
        { id: 'b', title: 'Title b', url: 'https://www.youtube.com/watch?v=b' },
      ],
    });
  });

  it('flattens nested playlists, drops duplicates and skips entries without a URL', () => {
    const playlist = parseYtDlpPlaylist(
      JSON.stringify({
        _type: 'playlist',
        id: 'channel',
        entries: [
          { _type: 'playlist', title: 'Videos', entries: [entry('a'), entry('b')] },
          { _type: 'playlist', title: 'Live', entries: [entry('a'), { id: 'no-url' }, null] },
          { _type: 'url', url: 'ytsearch:not-http' },
          { _type: 'url', url: 'https://example.com/untitled' },
        ],
      }),
      10,
    );

    expect(playlist.title).toBe('channel');
    expect(playlist.entries.map((item) => item.id)).toEqual(['a', 'b', 'https://example.com/untitled']);
    expect(playlist.entries.at(-1)?.title).toBe('https://example.com/untitled');
  });

  it('treats a single video as a one-entry playlist', () => {
    const playlist = parseYtDlpPlaylist(
      JSON.stringify({
        _type: 'video',
        id: 'solo',
        title: 'Only song',
        webpage_url: 'https://www.youtube.com/watch?v=solo',
      }),
      10,
    );

    expect(playlist).toEqual({
      title: 'Only song',
      truncated: false,
      entries: [{ id: 'solo', title: 'Only song', url: 'https://www.youtube.com/watch?v=solo' }],
    });
  });

  it('cuts the playlist at the limit and says so', () => {
    const playlist = parseYtDlpPlaylist(
      JSON.stringify({ title: 'Mix', entries: [entry('a'), entry('b'), entry('c')] }),
      2,
    );

    expect(playlist.truncated).toBe(true);
    expect(playlist.entries.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('rejects output that is not playlist JSON', () => {
    expect(() => parseYtDlpPlaylist('not json', 10)).toThrowError(/Could not parse/);
    expect(() => parseYtDlpPlaylist('[]', 10)).toThrowError(/unexpected/);
    expect(parseYtDlpPlaylist('{}', 10)).toEqual({ title: 'playlist', entries: [], truncated: false });
  });

  it('asks yt-dlp for a flat listing with one entry more than the limit', async () => {
    const scriptPath = path.join(baseDirectory, 'list-ytdlp.sh');
    const argsFile = path.join(baseDirectory, 'list-args.txt');
    await writeFile(
      scriptPath,
      `#!/bin/sh
for arg in "$@"; do printf '%s\\n' "$arg" >> "${argsFile}"; done
printf '%s' '{"title":"Listed","entries":[{"id":"a","url":"https://example.com/a","title":"A"}]}'
`,
    );
    await chmod(scriptPath, 0o755);

    const playlist = await listYtDlpPlaylist({
      url: 'https://example.com/watch?v=1&list=2',
      executable: scriptPath,
      maxEntries: 25,
      proxyUrl: ' socks5://127.0.0.1:9050 ',
    });

    expect(playlist.title).toBe('Listed');
    expect(playlist.entries).toHaveLength(1);
    const args = (await readFile(argsFile, 'utf8')).trim().split('\n');
    expect(args).toEqual(expect.arrayContaining(['--flat-playlist', '--dump-single-json', '--yes-playlist']));
    expect(args).not.toContain('--no-playlist');
    expect(args[args.indexOf('--playlist-end') + 1]).toBe('26');
    expect(args[args.indexOf('--proxy') + 1]).toBe('socks5://127.0.0.1:9050');
    expect(args.slice(-2)).toEqual(['--', 'https://example.com/watch?v=1&list=2']);
  });

  it('reports a failing listing', async () => {
    const scriptPath = path.join(baseDirectory, 'broken-ytdlp.sh');
    await writeFile(scriptPath, '#!/bin/sh\necho "ERROR: playlist does not exist" >&2\nexit 1\n');
    await chmod(scriptPath, 0o755);

    await expect(
      listYtDlpPlaylist({ url: 'https://example.com/list', executable: scriptPath, maxEntries: 5 }),
    ).rejects.toThrowError(/playlist does not exist/);
  });
});

describe('YouTube playlist downloads', () => {
  let playlistJson: string;
  let callsFile: string;
  let youtubeConfig: AppConfig;

  /**
   * Stands in for yt-dlp: prints the prepared JSON when listing, otherwise
   * "downloads" <last URL segment>.mp3 and fails for URLs ending in "broken".
   */
  beforeEach(async () => {
    playlistJson = path.join(baseDirectory, 'playlist.json');
    callsFile = path.join(baseDirectory, 'calls.txt');
    const scriptPath = path.join(baseDirectory, 'playlist-ytdlp.sh');
    await writeFile(
      scriptPath,
      `#!/bin/sh
mode=download
out=""
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    --flat-playlist) mode=list; shift ;;
    -o) out="$2"; shift 2 ;;
    --) url="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ "$mode" = list ]; then
  cat "${playlistJson}"
  exit 0
fi
printf '%s\\n' "$url" >> "${callsFile}"
name="\${url##*/}"
if [ "$name" = broken ]; then
  echo "ERROR: Video unavailable" >&2
  exit 1
fi
# yt-dlp reads %% in the output template as a literal percent sign.
directory=$(printf '%s' "\${out%/*}" | sed 's/%%/%/g')
printf 'audio' > "$directory/$name.mp3"
printf '"%s"\\n' "$directory/$name.mp3"
`,
    );
    await chmod(scriptPath, 0o755);

    youtubeConfig = loadConfig(
      {
        DEEZER_COOKIE_ARL: ARL,
        DEEZER_DOWNLOAD_DIR: baseDirectory,
        DEEZER_MPD_ENABLED: 'false',
        DEEZER_YTDLP_PATH: scriptPath,
        DEEZER_YOUTUBE_PLAYLIST_MAX: '3',
      },
      { cwd: baseDirectory },
    );
  });

  async function setPlaylist(title: string, names: string[]): Promise<void> {
    const entries = names.map((name) => ({ id: `id-${name}`, title: name, url: `https://example.com/${name}` }));
    await writeFile(playlistJson, JSON.stringify({ _type: 'playlist', title, entries }));
  }

  async function downloadCalls(): Promise<string[]> {
    try {
      return (await readFile(callsFile, 'utf8')).trim().split('\n');
    } catch {
      return [];
    }
  }

  function makeDownloads(): DownloadService {
    return new DownloadService(youtubeConfig, makeService().service, logger);
  }

  it('downloads every song into a playlist folder and writes an m3u8', async () => {
    await setPlaylist('Road: Trip', ['one', 'two']);
    const progress: Array<[number, number]> = [];
    const warnings: string[] = [];

    const media: Array<Partial<TaskMedia>> = [];

    const files = await makeDownloads().downloadYoutubePlaylist('https://example.com/list', false, {
      reportProgress: (current, maximum) => progress.push([current, maximum]),
      reportWarning: (message) => warnings.push(message),
      reportMedia: (reported) => media.push(reported),
    });

    expect(media).toEqual([{ title: 'Road: Trip', subtitle: '2 songs' }]);
    const directory = path.join(baseDirectory, 'youtube', 'Road Trip');
    expect(files).toEqual([
      path.join(directory, 'one.mp3'),
      path.join(directory, 'two.mp3'),
      path.join(directory, '00 Road Trip.m3u8'),
    ]);
    expect(await readFile(path.join(directory, '00 Road Trip.m3u8'), 'utf8')).toBe('one.mp3\ntwo.mp3\n');
    expect(progress).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
    ]);
    expect(warnings).toEqual([]);
    expect(JSON.parse(await readFile(path.join(directory, YOUTUBE_PLAYLIST_MANIFEST), 'utf8'))).toEqual({
      'id-one': 'one.mp3',
      'id-two': 'two.mp3',
    });
  });

  it('skips songs that were already downloaded', async () => {
    await setPlaylist('Again', ['one', 'two']);
    const downloads = makeDownloads();
    await downloads.downloadYoutubePlaylist('https://example.com/list', false);
    expect(await downloadCalls()).toHaveLength(2);

    const directory = path.join(baseDirectory, 'youtube', 'Again');
    await rm(path.join(directory, 'two.mp3'));
    await setPlaylist('Again', ['one', 'two', 'three']);
    const files = await downloads.downloadYoutubePlaylist('https://example.com/list', false);

    // "one" is still on disk; "two" was deleted and "three" is new.
    expect(await downloadCalls()).toEqual([
      'https://example.com/one',
      'https://example.com/two',
      'https://example.com/two',
      'https://example.com/three',
    ]);
    expect(files.map((file) => path.basename(file))).toEqual(['one.mp3', 'two.mp3', 'three.mp3', '00 Again.m3u8']);
  });

  it('ignores a damaged or tampered manifest', async () => {
    await setPlaylist('Damaged', ['one', 'two']);
    const directory = path.join(baseDirectory, 'youtube', 'Damaged');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(baseDirectory, 'outside.mp3'), 'secret');
    const downloads = makeDownloads();

    await writeFile(path.join(directory, YOUTUBE_PLAYLIST_MANIFEST), 'not json');
    await downloads.downloadYoutubePlaylist('https://example.com/list', false);
    expect(await downloadCalls()).toHaveLength(2);

    await rm(path.join(directory, 'one.mp3'));
    await writeFile(
      path.join(directory, YOUTUBE_PLAYLIST_MANIFEST),
      JSON.stringify({ 'id-one': '../../outside.mp3', 'id-two': 7 }),
    );
    const files = await downloads.downloadYoutubePlaylist('https://example.com/list', false);

    expect(await downloadCalls()).toHaveLength(4);
    expect(files).not.toContain(path.join(baseDirectory, 'outside.mp3'));
  });

  it('continues after a song fails and reports it as a warning', async () => {
    await setPlaylist('Partly', ['one', 'broken', 'two']);
    const warnings: string[] = [];

    const files = await makeDownloads().downloadYoutubePlaylist('https://example.com/list', false, {
      reportWarning: (message) => warnings.push(message),
    });

    expect(files.map((file) => path.basename(file))).toEqual(['one.mp3', 'two.mp3', '00 Partly.m3u8']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^Could not download "broken": .*Video unavailable/s);
  });

  it('limits the number of songs and warns about the rest', async () => {
    await setPlaylist('Endless', ['one', 'two', 'three', 'four', 'five']);
    const warnings: string[] = [];

    const files = await makeDownloads().downloadYoutubePlaylist('https://example.com/list', false, {
      reportWarning: (message) => warnings.push(message),
    });

    expect(await downloadCalls()).toHaveLength(3);
    expect(files).toHaveLength(4);
    expect(warnings).toEqual(["Playlist 'Endless' has more than 3 songs; only the first 3 are downloaded"]);
  });

  it('keeps a percent sign in the playlist name', async () => {
    await setPlaylist('100% hits', ['one']);

    const files = await makeDownloads().downloadYoutubePlaylist('https://example.com/list', false);

    expect(files[0]).toBe(path.join(baseDirectory, 'youtube', '100% hits', 'one.mp3'));
  });

  it('fails when the playlist is empty or nothing could be downloaded', async () => {
    const downloads = makeDownloads();

    await setPlaylist('Empty', []);
    await expect(downloads.downloadYoutubePlaylist('https://example.com/list', false)).rejects.toThrowError(
      /Playlist 'Empty' has no songs/,
    );

    await setPlaylist('Dead', ['broken']);
    await expect(downloads.downloadYoutubePlaylist('https://example.com/list', false)).rejects.toBeInstanceOf(
      DownloadError,
    );
    await expect(readdir(path.join(baseDirectory, 'youtube', 'Dead'))).resolves.toEqual([]);
  });
});
