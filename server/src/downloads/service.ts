import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { TaskMedia } from '@song-catcher/shared';
import type { Logger } from 'pino';

import type { AppConfig } from '../config/env.js';
import type { DeezerClient } from '../deezer/client.js';
import type { DeezerSong } from '../deezer/types.js';
import { errorMessage } from '../lib/errors.js';
import { isNonEmptyFile, removeQuietly, temporaryPathFor } from '../lib/files.js';
import type { TransferReporter } from '../lib/transfer.js';
import { syncWithMpd } from './mpd-sync.js';
import { buildSongFilename, cleanFilename, songDirectory, type SongPathType } from './paths.js';
import { readPlaylistManifest, writePlaylistManifest, type PlaylistManifest } from './playlist-manifest.js';
import { downloadWithYtDlp, listYtDlpPlaylist, type YoutubePlaylistEntry, type YoutubeVideoInfo } from './youtube.js';

export type DeezerService = Pick<
  DeezerClient,
  'parseDeezerPlaylist' | 'getSongInfosFromWebsite' | 'downloadSong' | 'fileExtension'
>;

export interface DownloadReporters {
  reportProgress?: (current: number, maximum: number) => void;
  reportTransfer?: TransferReporter;
  reportWarning?: (message: string) => void;
  reportMedia?: (media: Partial<TaskMedia>) => void;
}

export class DownloadError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DownloadError';
  }
}

interface Batch<Item> {
  items: readonly Item[];
  download: (item: Item) => Promise<string>;
  describe: (item: Item) => string;
  logFailure: (item: Item, error: unknown) => void;
  reporters: DownloadReporters;
}

function songCount(count: number): string {
  return count === 1 ? '1 song' : `${count} songs`;
}

function songLabel(song: DeezerSong): string {
  return `"${song.ART_NAME || 'unknown artist'} - ${song.SNG_TITLE || song.SNG_ID}"`;
}

export class DownloadService {
  public constructor(
    private readonly config: AppConfig,
    private readonly deezer: DeezerService,
    private readonly logger: Logger,
  ) {}

  public async downloadTrack(
    trackId: string,
    addToPlaylist: boolean,
    reporters: DownloadReporters = {},
  ): Promise<string[]> {
    reporters.reportProgress?.(0, 1);
    const song = await this.deezer.getSongInfosFromWebsite('track', trackId);
    reporters.reportMedia?.({
      title: [song.ART_NAME, song.SNG_TITLE].filter(Boolean).join(' - ') || `Track ${trackId}`,
      subtitle: song.ALB_TITLE || null,
    });
    const filename = await this.downloadSongToDisk('track', song, reporters);
    reporters.reportProgress?.(1, 1);
    await this.updateMpd([filename], addToPlaylist);
    return [filename];
  }

  public async downloadAlbum(
    albumId: string,
    addToPlaylist: boolean,
    reporters: DownloadReporters = {},
  ): Promise<string[]> {
    const songs = await this.deezer.getSongInfosFromWebsite('album', albumId);
    const first = songs[0];
    if (first) {
      reporters.reportMedia?.({
        title: first.ALB_TITLE || `Album ${albumId}`,
        subtitle: first.ALB_ART_NAME || first.ART_NAME || null,
      });
    }

    const files = await this.downloadBatch({
      items: songs,
      download: (song) => this.downloadSongToDisk('album', song, reporters),
      describe: songLabel,
      logFailure: (song, error) => {
        this.logger.warn({ err: error, albumId, songId: song.SNG_ID }, 'could not download album song; continuing');
      },
      reporters,
    });
    if (files.length === 0) {
      throw new DownloadError(`No songs from album ${albumId} could be downloaded`);
    }

    await this.updateMpd(files, addToPlaylist);
    return files;
  }

  public async downloadPlaylist(
    playlistUrl: string,
    addToPlaylist: boolean,
    reporters: DownloadReporters = {},
  ): Promise<string[]> {
    const playlist = await this.deezer.parseDeezerPlaylist(playlistUrl);
    reporters.reportMedia?.({ title: playlist.name, subtitle: songCount(playlist.songs.length) });
    if (playlist.songs.length === 0) {
      throw new DownloadError(`Deezer playlist '${playlist.name}' has no songs`);
    }

    const files = await this.downloadBatch({
      items: playlist.songs,
      download: (song) => this.downloadSongToDisk('playlist', song, reporters, playlist.name),
      describe: songLabel,
      logFailure: (song, error) => {
        this.logger.warn(
          { err: error, playlist: playlist.name, songId: song.SNG_ID },
          'could not download playlist song; continuing',
        );
      },
      reporters,
    });
    if (files.length === 0) {
      throw new DownloadError(`No songs from playlist '${playlist.name}' could be downloaded`);
    }

    return this.finishPlaylist(files, addToPlaylist);
  }

  public async downloadSongToDisk(
    searchType: SongPathType,
    song: DeezerSong,
    reporters: DownloadReporters = {},
    playlistName?: string,
  ): Promise<string> {
    const directory = songDirectory(this.config.downloads, searchType, song, playlistName);
    await mkdir(directory, { recursive: true });

    const preferredExtension = this.deezer.fileExtension;
    const absoluteFilename = path.join(directory, buildSongFilename(song, searchType, preferredExtension));

    if (await isNonEmptyFile(absoluteFilename)) {
      this.logger.info({ file: absoluteFilename }, 'skipping existing song');
      return absoluteFilename;
    }

    this.logger.info({ file: absoluteFilename, songId: song.SNG_ID }, 'downloading song');
    const temporaryFilename = temporaryPathFor(absoluteFilename);
    try {
      const { extension } = await this.deezer.downloadSong(song, temporaryFilename, reporters.reportTransfer);
      const finalFilename =
        extension === preferredExtension
          ? absoluteFilename
          : path.join(directory, buildSongFilename(song, searchType, extension));
      await rename(temporaryFilename, finalFilename);
      return finalFilename;
    } catch (error) {
      await removeQuietly(temporaryFilename);
      throw error;
    }
  }

  public async downloadYoutube(
    url: string,
    addToPlaylist: boolean,
    reporters: DownloadReporters = {},
  ): Promise<string[]> {
    const filename = await this.downloadWithYtDlp(url, this.config.downloads.youtubeDir, reporters, (info) => {
      reporters.reportMedia?.({ title: info.title, date: info.uploadDate ?? null });
    });
    await this.updateMpd([filename], addToPlaylist);
    return [filename];
  }

  public async downloadYoutubePlaylist(
    url: string,
    addToPlaylist: boolean,
    reporters: DownloadReporters = {},
  ): Promise<string[]> {
    const maxEntries = this.config.youtube.playlistMaxEntries;
    const playlist = await listYtDlpPlaylist({
      url,
      executable: this.config.tools.ytdlpPath,
      proxyUrl: this.config.deezer.proxyUrl,
      maxEntries,
    });
    reporters.reportMedia?.({ title: playlist.title, subtitle: songCount(playlist.entries.length) });
    if (playlist.entries.length === 0) {
      throw new DownloadError(`Playlist '${playlist.title}' has no songs`);
    }
    if (playlist.truncated) {
      reporters.reportWarning?.(
        `Playlist '${playlist.title}' has more than ${maxEntries} songs; only the first ${maxEntries} are downloaded`,
      );
    }

    const directory = path.join(this.config.downloads.youtubeDir, cleanFilename(playlist.title));
    await mkdir(directory, { recursive: true });
    const manifest = await readPlaylistManifest(directory);

    const downloaded = await this.downloadBatch({
      items: playlist.entries,
      download: (entry) => this.downloadPlaylistEntry(entry, directory, manifest, reporters),
      describe: (entry) => `"${entry.title}"`,
      logFailure: (entry, error) => {
        this.logger.warn(
          { err: error, playlist: playlist.title, url: entry.url },
          'could not download playlist song; continuing',
        );
      },
      reporters,
    });
    if (downloaded.length === 0) {
      throw new DownloadError(`No songs from playlist '${playlist.title}' could be downloaded`);
    }

    return this.finishPlaylist([...new Set(downloaded)], addToPlaylist);
  }

  private async downloadPlaylistEntry(
    entry: YoutubePlaylistEntry,
    directory: string,
    manifest: PlaylistManifest,
    reporters: DownloadReporters,
  ): Promise<string> {
    const knownFilename = manifest[entry.id];
    if (knownFilename) {
      const knownFile = path.join(directory, knownFilename);
      if (await isNonEmptyFile(knownFile)) {
        this.logger.info({ file: knownFile }, 'skipping existing song');
        return knownFile;
      }
    }

    const filename = await this.downloadWithYtDlp(entry.url, directory, reporters);
    if (path.dirname(filename) === directory) {
      manifest[entry.id] = path.basename(filename);
      await writePlaylistManifest(directory, manifest).catch((error: unknown) => {
        this.logger.warn({ err: error, directory }, 'could not save the playlist manifest');
      });
    }
    return filename;
  }

  private downloadWithYtDlp(
    url: string,
    destinationDirectory: string,
    reporters: DownloadReporters,
    onInfo?: (info: YoutubeVideoInfo) => void,
  ): Promise<string> {
    return downloadWithYtDlp({
      url,
      destinationDirectory,
      onInfo,
      onTransfer: reporters.reportTransfer,
      executable: this.config.tools.ytdlpPath,
      ffmpegPath: this.config.tools.ffmpegPath,
      proxyUrl: this.config.deezer.proxyUrl,
    });
  }

  private async downloadBatch<Item>(batch: Batch<Item>): Promise<string[]> {
    const { items, reporters } = batch;
    const files: string[] = [];

    for (const [index, item] of items.entries()) {
      reporters.reportProgress?.(index, items.length);
      try {
        files.push(await batch.download(item));
      } catch (error) {
        batch.logFailure(item, error);
        reporters.reportWarning?.(`Could not download ${batch.describe(item)}: ${errorMessage(error)}`);
      }
    }
    reporters.reportProgress?.(items.length, items.length);
    return files;
  }

  private async finishPlaylist(files: string[], addToPlaylist: boolean): Promise<string[]> {
    await this.updateMpd(files, addToPlaylist);
    return [...files, await this.createM3u8File(files)];
  }

  public async createM3u8File(files: string[]): Promise<string> {
    const first = files[0];
    if (!first) {
      throw new DownloadError('Cannot create an m3u8 file without songs');
    }

    const playlistDirectory = path.dirname(first);
    const m3u8Path = path.join(playlistDirectory, `00 ${path.basename(playlistDirectory)}.m3u8`);

    const existingFiles = await this.existingFiles(files);
    if (existingFiles.length === 0) {
      throw new DownloadError('Cannot create an m3u8 file; none of the songs exist');
    }

    const entries = existingFiles.map((file) => path.basename(file));
    await writeFile(m3u8Path, `${entries.join('\n')}\n`, 'utf8');
    this.logger.info({ file: m3u8Path }, 'created m3u8 playlist');
    return m3u8Path;
  }

  private async existingFiles(files: readonly string[]): Promise<string[]> {
    const existing: string[] = [];
    for (const file of files) {
      if (await isNonEmptyFile(file)) {
        existing.push(file);
      }
    }
    return existing;
  }

  private updateMpd(files: readonly string[], addToPlaylist: boolean): Promise<void> {
    return syncWithMpd(this.config.mpd, files, addToPlaylist, this.logger);
  }
}
