import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import archiver from 'archiver';
import type { Logger } from 'pino';

import type { AppConfig } from '../config/env.js';
import type { DeezerClient } from '../deezer/client.js';
import { TYPE_ALBUM, TYPE_PLAYLIST, TYPE_TRACK, type DeezerSong } from '../deezer/types.js';
import { MpdClient } from '../mpd/client.js';
import { buildSongFilename, mpdRelativePath, songDirectory, type SongPathType } from './paths.js';
import { downloadWithYtDlp } from './youtube.js';

export type DeezerService = Pick<
  DeezerClient,
  | 'deezerSearch'
  | 'parseDeezerPlaylist'
  | 'getDeezerFavorites'
  | 'getSongInfosFromWebsite'
  | 'downloadSong'
  | 'downloadPicture'
  | 'testLogin'
  | 'fileExtension'
>;

export type ProgressReporter = (current: number, maximum: number) => void;

export class DownloadError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DownloadError';
  }
}

async function fileExists(filename: string): Promise<boolean> {
  try {
    const info = await stat(filename);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
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
    onProgress?: ProgressReporter,
  ): Promise<string[]> {
    onProgress?.(0, 1);
    const song = await this.deezer.getSongInfosFromWebsite(TYPE_TRACK, trackId);
    const filename = await this.downloadSongToDisk(TYPE_TRACK, song);
    onProgress?.(1, 1);
    await this.updateMpd([filename], addToPlaylist);
    return [filename];
  }

  public async downloadAlbum(
    albumId: string,
    addToPlaylist: boolean,
    createZip: boolean,
    onProgress?: ProgressReporter,
  ): Promise<string[]> {
    const songs = await this.deezer.getSongInfosFromWebsite(TYPE_ALBUM, albumId);
    const files: string[] = [];

    for (const [index, song] of songs.entries()) {
      onProgress?.(index, songs.length);
      try {
        files.push(await this.downloadSongToDisk(TYPE_ALBUM, song));
      } catch (error) {
        this.logger.warn(
          { err: error, albumId, songId: song.SNG_ID },
          'could not download album song; continuing',
        );
      }
    }
    onProgress?.(songs.length, songs.length);

    if (files.length === 0) {
      throw new DownloadError(`No songs from album ${albumId} could be downloaded`);
    }

    await this.updateMpd(files, addToPlaylist);
    if (createZip) {
      return [await this.createZipFile(files)];
    }
    return files;
  }

  public async downloadPlaylist(
    playlistUrl: string,
    addToPlaylist: boolean,
    createZip: boolean,
    onProgress?: ProgressReporter,
  ): Promise<string[]> {
    const playlist = await this.deezer.parseDeezerPlaylist(playlistUrl);
    if (playlist.songs.length === 0) {
      throw new DownloadError(`Deezer playlist '${playlist.name}' has no songs`);
    }

    const files: string[] = [];
    for (const [index, song] of playlist.songs.entries()) {
      onProgress?.(index, playlist.songs.length);
      try {
        files.push(await this.downloadSongToDisk(TYPE_PLAYLIST, song, playlist.name));
      } catch (error) {
        this.logger.warn(
          { err: error, playlist: playlist.name, songId: song.SNG_ID },
          'could not download playlist song; continuing',
        );
      }
    }
    onProgress?.(playlist.songs.length, playlist.songs.length);

    if (files.length === 0) {
      throw new DownloadError(`No songs from playlist '${playlist.name}' could be downloaded`);
    }

    await this.updateMpd(files, addToPlaylist);
    const m3u8File = await this.createM3u8File(files);
    const filesWithPlaylist = [...files, m3u8File];
    if (createZip) {
      return [await this.createZipFile(filesWithPlaylist)];
    }
    return filesWithPlaylist;
  }

  public async downloadFavorites(
    userId: string,
    addToPlaylist: boolean,
    createZip: boolean,
    onProgress?: ProgressReporter,
  ): Promise<string[]> {
    const favoriteSongIds = await this.deezer.getDeezerFavorites(userId);
    if (favoriteSongIds.length === 0) {
      throw new DownloadError(`Deezer user ${userId} has no favorite songs`);
    }

    const playlistName = `favorites_${userId}`;
    const files: string[] = [];
    for (const [index, songId] of favoriteSongIds.entries()) {
      onProgress?.(index, favoriteSongIds.length);
      try {
        const song = await this.deezer.getSongInfosFromWebsite(TYPE_TRACK, songId);
        files.push(await this.downloadSongToDisk(TYPE_PLAYLIST, song, playlistName));
      } catch (error) {
        this.logger.warn(
          { err: error, userId, songId },
          'could not download favorite song; continuing',
        );
      }
    }
    onProgress?.(favoriteSongIds.length, favoriteSongIds.length);

    if (files.length === 0) {
      throw new DownloadError(`No favorite songs from user ${userId} could be downloaded`);
    }

    await this.updateMpd(files, addToPlaylist);
    const m3u8File = await this.createM3u8File(files);
    const filesWithPlaylist = [...files, m3u8File];
    if (createZip) {
      return [await this.createZipFile(filesWithPlaylist)];
    }
    return filesWithPlaylist;
  }

  public async downloadYoutube(url: string, addToPlaylist: boolean): Promise<string[]> {
    const filename = await downloadWithYtDlp({
      url,
      destinationDirectory: this.config.downloads.youtubeDir,
      executable: this.config.tools.ytdlpPath,
      ffmpegPath: this.config.tools.ffmpegPath,
      proxyUrl: this.config.deezer.proxyUrl,
    });
    await this.updateMpd([filename], addToPlaylist);
    return [filename];
  }

  public async downloadSongToDisk(
    searchType: SongPathType,
    song: DeezerSong,
    playlistName?: string,
  ): Promise<string> {
    const directory = songDirectory(this.config.downloads, searchType, song, playlistName);
    await mkdir(directory, { recursive: true });

    const filename = buildSongFilename(song, searchType, this.deezer.fileExtension);
    const absoluteFilename = path.join(directory, filename);

    if (await fileExists(absoluteFilename)) {
      this.logger.info({ file: absoluteFilename }, 'skipping existing song');
      return absoluteFilename;
    }

    this.logger.info({ file: absoluteFilename, songId: song.SNG_ID }, 'downloading song');
    const temporaryFilename = `${absoluteFilename}.${randomUUID()}.part`;
    try {
      await this.deezer.downloadSong(song, temporaryFilename);
      await rename(temporaryFilename, absoluteFilename);
    } catch (error) {
      await rm(temporaryFilename, { force: true }).catch(() => undefined);
      throw error;
    }
    return absoluteFilename;
  }

  public async createM3u8File(files: string[]): Promise<string> {
    const first = files[0];
    if (!first) {
      throw new DownloadError('Cannot create an m3u8 file without songs');
    }

    const playlistDirectory = path.dirname(first);
    const m3u8Filename = `00 ${path.basename(playlistDirectory)}.m3u8`;
    const m3u8Path = path.join(playlistDirectory, m3u8Filename);

    const existingFiles: string[] = [];
    for (const file of files) {
      if (await fileExists(file)) {
        existingFiles.push(path.basename(file));
      }
    }
    if (existingFiles.length === 0) {
      throw new DownloadError('Cannot create an m3u8 file; none of the songs exist');
    }

    await writeFile(m3u8Path, `${existingFiles.join('\n')}\n`, 'utf8');
    this.logger.info({ file: m3u8Path }, 'created m3u8 playlist');
    return m3u8Path;
  }

  public async createZipFile(files: string[]): Promise<string> {
    const first = files[0];
    if (!first) {
      throw new DownloadError('Cannot create a zip file without songs');
    }

    const parentDirectory = path.basename(path.dirname(first));
    const zipPath = path.join(this.config.downloads.zipsDir, `${parentDirectory}.zip`);
    await mkdir(this.config.downloads.zipsDir, { recursive: true });

    const existingFiles: string[] = [];
    for (const file of files) {
      if (await fileExists(file)) {
        existingFiles.push(file);
      }
    }
    if (existingFiles.length === 0) {
      throw new DownloadError('Cannot create a zip file; none of the songs exist');
    }

    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    const completed = new Promise<void>((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
    });

    archive.pipe(output);
    for (const file of existingFiles) {
      archive.file(file, {
        name: `${parentDirectory}/${path.basename(file)}`,
      });
    }

    try {
      await archive.finalize();
      await completed;
    } catch (error) {
      await rm(zipPath, { force: true }).catch(() => undefined);
      throw new DownloadError(`Could not create zip file ${zipPath}: ${String(error)}`, {
        cause: error,
      });
    }

    this.logger.info({ file: zipPath }, 'created zip file');
    return zipPath;
  }

  private async updateMpd(files: string[], addToPlaylist: boolean): Promise<void> {
    if (!this.config.mpd.enabled) {
      return;
    }
    const musicDirRoot = this.config.mpd.musicDirRoot;
    if (!musicDirRoot) {
      this.logger.error('MPD is enabled, but DEEZER_MPD_MUSIC_DIR_ROOT is missing');
      return;
    }

    const client = new MpdClient(this.config.mpd.host, this.config.mpd.port, this.logger);
    try {
      await client.connect();
      await client.update();
      if (!addToPlaylist) {
        return;
      }

      for (const file of files) {
        let relative: string;
        try {
          relative = mpdRelativePath(musicDirRoot, file);
        } catch (error) {
          this.logger.error({ err: error, file }, 'cannot add file to MPD');
          continue;
        }
        if (await client.waitForFile(relative)) {
          await client.add(relative);
          this.logger.info({ file: relative }, 'added file to MPD playlist');
        } else {
          this.logger.warn({ file: relative }, 'MPD did not index file; not adding it');
        }
      }
    } catch (error) {
      this.logger.error(
        { err: error, host: this.config.mpd.host, port: this.config.mpd.port },
        'could not update MPD',
      );
    } finally {
      client.close();
    }
  }
}
