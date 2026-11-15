import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Logger } from 'pino';

import type { AppConfig } from '../config/env.js';
import type { DeezerClient } from '../deezer/client.js';
import type { DeezerSong } from '../deezer/types.js';
import { errorMessage } from '../lib/errors.js';
import { isNonEmptyFile, removeQuietly, temporaryPathFor } from '../lib/files.js';
import { writeZipArchive } from './archive.js';
import { syncWithMpd } from './mpd-sync.js';
import { buildSongFilename, cleanFilename, songDirectory, type SongPathType } from './paths.js';
import { readPlaylistManifest, writePlaylistManifest, type PlaylistManifest } from './playlist-manifest.js';
import { downloadWithYtDlp, listYtDlpPlaylist, type YoutubePlaylistEntry } from './youtube.js';

/** The part of the Deezer client that downloads need. */
export type DeezerService = Pick<
  DeezerClient,
  'parseDeezerPlaylist' | 'getDeezerFavorites' | 'getSongInfosFromWebsite' | 'downloadSong' | 'fileExtension'
>;

export type ProgressReporter = (current: number, maximum: number) => void;
export type WarningReporter = (message: string) => void;

export class DownloadError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DownloadError';
  }
}

/** One run over the items of an album or playlist. */
interface Batch<Item> {
  items: readonly Item[];
  /** Downloads one item and resolves to the file it ended up in. */
  download: (item: Item) => Promise<string>;
  /** Names the item in the warning shown to the user. */
  describe: (item: Item) => string;
  /** Logs a failed item together with whatever identifies it. */
  logFailure: (item: Item, error: unknown) => void;
  onProgress?: ProgressReporter;
  onWarning?: WarningReporter;
}

interface CollectionOptions {
  addToPlaylist: boolean;
  createZip: boolean;
  /** Playlists get an m3u8 file next to their songs; albums are ordered by file name already. */
  withPlaylistFile: boolean;
}

function songLabel(song: DeezerSong): string {
  return `"${song.ART_NAME || 'unknown artist'} - ${song.SNG_TITLE || song.SNG_ID}"`;
}

/**
 * Turns "download this track/album/playlist" into files on disk, and follows
 * up with the optional extras: an m3u8 playlist, a zip archive and MPD.
 *
 * Every public download method resolves to the files a user can fetch: the
 * songs themselves, or the single zip when one was requested.
 */
export class DownloadService {
  public constructor(
    private readonly config: AppConfig,
    private readonly deezer: DeezerService,
    private readonly logger: Logger,
  ) {}

  // --- Deezer ----------------------------------------------------------------

  public async downloadTrack(
    trackId: string,
    addToPlaylist: boolean,
    onProgress?: ProgressReporter,
  ): Promise<string[]> {
    onProgress?.(0, 1);
    const song = await this.deezer.getSongInfosFromWebsite('track', trackId);
    const filename = await this.downloadSongToDisk('track', song);
    onProgress?.(1, 1);
    await this.updateMpd([filename], addToPlaylist);
    return [filename];
  }

  public async downloadAlbum(
    albumId: string,
    addToPlaylist: boolean,
    createZip: boolean,
    onProgress?: ProgressReporter,
    onWarning?: WarningReporter,
  ): Promise<string[]> {
    const songs = await this.deezer.getSongInfosFromWebsite('album', albumId);

    const files = await this.downloadBatch({
      items: songs,
      download: (song) => this.downloadSongToDisk('album', song),
      describe: songLabel,
      logFailure: (song, error) => {
        this.logger.warn({ err: error, albumId, songId: song.SNG_ID }, 'could not download album song; continuing');
      },
      onProgress,
      onWarning,
    });
    if (files.length === 0) {
      throw new DownloadError(`No songs from album ${albumId} could be downloaded`);
    }

    return this.finishCollection(files, { addToPlaylist, createZip, withPlaylistFile: false });
  }

  public async downloadPlaylist(
    playlistUrl: string,
    addToPlaylist: boolean,
    createZip: boolean,
    onProgress?: ProgressReporter,
    onWarning?: WarningReporter,
  ): Promise<string[]> {
    const playlist = await this.deezer.parseDeezerPlaylist(playlistUrl);
    if (playlist.songs.length === 0) {
      throw new DownloadError(`Deezer playlist '${playlist.name}' has no songs`);
    }

    const files = await this.downloadBatch({
      items: playlist.songs,
      download: (song) => this.downloadSongToDisk('playlist', song, playlist.name),
      describe: songLabel,
      logFailure: (song, error) => {
        this.logger.warn(
          { err: error, playlist: playlist.name, songId: song.SNG_ID },
          'could not download playlist song; continuing',
        );
      },
      onProgress,
      onWarning,
    });
    if (files.length === 0) {
      throw new DownloadError(`No songs from playlist '${playlist.name}' could be downloaded`);
    }

    return this.finishCollection(files, { addToPlaylist, createZip, withPlaylistFile: true });
  }

  /** Downloads every song a user has marked as a favorite into a `favorites_<userId>` playlist. */
  public async downloadFavorites(
    userId: string,
    addToPlaylist: boolean,
    createZip: boolean,
    onProgress?: ProgressReporter,
    onWarning?: WarningReporter,
  ): Promise<string[]> {
    const favoriteSongIds = await this.deezer.getDeezerFavorites(userId);
    if (favoriteSongIds.length === 0) {
      throw new DownloadError(`Deezer user ${userId} has no favorite songs`);
    }

    const playlistName = `favorites_${userId}`;
    const files = await this.downloadBatch({
      items: favoriteSongIds,
      download: async (songId) => {
        const song = await this.deezer.getSongInfosFromWebsite('track', songId);
        return this.downloadSongToDisk('playlist', song, playlistName);
      },
      describe: (songId) => `song ${songId}`,
      logFailure: (songId, error) => {
        this.logger.warn({ err: error, userId, songId }, 'could not download favorite song; continuing');
      },
      onProgress,
      onWarning,
    });
    if (files.length === 0) {
      throw new DownloadError(`No favorite songs from user ${userId} could be downloaded`);
    }

    return this.finishCollection(files, { addToPlaylist, createZip, withPlaylistFile: true });
  }

  /**
   * Downloads one song to its final place and returns the path. A song that
   * is already there is not downloaded again.
   */
  public async downloadSongToDisk(searchType: SongPathType, song: DeezerSong, playlistName?: string): Promise<string> {
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
      // Deezer may fall back to a lower quality (e.g. MP3 when a track has
      // no FLAC), so the final name uses the extension actually downloaded.
      const { extension } = await this.deezer.downloadSong(song, temporaryFilename);
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

  // --- YouTube and everything else yt-dlp understands --------------------------

  public async downloadYoutube(url: string, addToPlaylist: boolean): Promise<string[]> {
    const filename = await this.downloadWithYtDlp(url, this.config.downloads.youtubeDir);
    await this.updateMpd([filename], addToPlaylist);
    return [filename];
  }

  public async downloadYoutubePlaylist(
    url: string,
    addToPlaylist: boolean,
    createZip: boolean,
    onProgress?: ProgressReporter,
    onWarning?: WarningReporter,
  ): Promise<string[]> {
    const maxEntries = this.config.youtube.playlistMaxEntries;
    const playlist = await listYtDlpPlaylist({
      url,
      executable: this.config.tools.ytdlpPath,
      proxyUrl: this.config.deezer.proxyUrl,
      maxEntries,
    });
    if (playlist.entries.length === 0) {
      throw new DownloadError(`Playlist '${playlist.title}' has no songs`);
    }
    if (playlist.truncated) {
      onWarning?.(
        `Playlist '${playlist.title}' has more than ${maxEntries} songs; only the first ${maxEntries} are downloaded`,
      );
    }

    const directory = path.join(this.config.downloads.youtubeDir, cleanFilename(playlist.title));
    await mkdir(directory, { recursive: true });
    const manifest = await readPlaylistManifest(directory);

    const downloaded = await this.downloadBatch({
      items: playlist.entries,
      download: (entry) => this.downloadPlaylistEntry(entry, directory, manifest),
      describe: (entry) => `"${entry.title}"`,
      logFailure: (entry, error) => {
        this.logger.warn(
          { err: error, playlist: playlist.title, url: entry.url },
          'could not download playlist song; continuing',
        );
      },
      onProgress,
      onWarning,
    });
    if (downloaded.length === 0) {
      throw new DownloadError(`No songs from playlist '${playlist.title}' could be downloaded`);
    }

    // Two videos with the same title end up in the same file.
    const files = [...new Set(downloaded)];
    return this.finishCollection(files, { addToPlaylist, createZip, withPlaylistFile: true });
  }

  /** Downloads one playlist entry unless the manifest says its file is already there. */
  private async downloadPlaylistEntry(
    entry: YoutubePlaylistEntry,
    directory: string,
    manifest: PlaylistManifest,
  ): Promise<string> {
    const knownFilename = manifest[entry.id];
    if (knownFilename) {
      const knownFile = path.join(directory, knownFilename);
      if (await isNonEmptyFile(knownFile)) {
        this.logger.info({ file: knownFile }, 'skipping existing song');
        return knownFile;
      }
    }

    const filename = await this.downloadWithYtDlp(entry.url, directory);
    if (path.dirname(filename) === directory) {
      manifest[entry.id] = path.basename(filename);
      await writePlaylistManifest(directory, manifest).catch((error: unknown) => {
        this.logger.warn({ err: error, directory }, 'could not save the playlist manifest');
      });
    }
    return filename;
  }

  private downloadWithYtDlp(url: string, destinationDirectory: string): Promise<string> {
    return downloadWithYtDlp({
      url,
      destinationDirectory,
      executable: this.config.tools.ytdlpPath,
      ffmpegPath: this.config.tools.ffmpegPath,
      proxyUrl: this.config.deezer.proxyUrl,
    });
  }

  // --- Shared steps ----------------------------------------------------------

  /**
   * Downloads the items one after another and returns the files of those that
   * worked. A failing item is reported as a warning and does not stop the rest.
   */
  private async downloadBatch<Item>(batch: Batch<Item>): Promise<string[]> {
    const { items, onProgress, onWarning } = batch;
    const files: string[] = [];

    for (const [index, item] of items.entries()) {
      onProgress?.(index, items.length);
      try {
        files.push(await batch.download(item));
      } catch (error) {
        batch.logFailure(item, error);
        onWarning?.(`Could not download ${batch.describe(item)}: ${errorMessage(error)}`);
      }
    }
    onProgress?.(items.length, items.length);
    return files;
  }

  /** Runs the steps that follow a multi-song download and returns what the task produced. */
  private async finishCollection(files: string[], options: CollectionOptions): Promise<string[]> {
    await this.updateMpd(files, options.addToPlaylist);
    const output = options.withPlaylistFile ? [...files, await this.createM3u8File(files)] : files;
    return options.createZip ? [await this.createZipFile(output)] : output;
  }

  /** Writes `00 <folder>.m3u8` next to the songs, listing them in download order. */
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

  /** Packs the files into `<zips dir>/<folder>.zip`, named after the folder they are in. */
  public async createZipFile(files: string[]): Promise<string> {
    const first = files[0];
    if (!first) {
      throw new DownloadError('Cannot create a zip file without songs');
    }

    const folderName = path.basename(path.dirname(first));
    const zipPath = path.join(this.config.downloads.zipsDir, `${folderName}.zip`);
    await mkdir(this.config.downloads.zipsDir, { recursive: true });

    const existingFiles = await this.existingFiles(files);
    if (existingFiles.length === 0) {
      throw new DownloadError('Cannot create a zip file; none of the songs exist');
    }

    try {
      await writeZipArchive(zipPath, folderName, existingFiles);
    } catch (error) {
      throw new DownloadError(`Could not create zip file ${zipPath}: ${String(error)}`, {
        cause: error,
      });
    }

    this.logger.info({ file: zipPath }, 'created zip file');
    return zipPath;
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
