import type { DebugResponse, FilesResponse, QueueTask, TaskAcceptedResponse } from '@song-catcher/shared';
import type { FastifyReply } from 'fastify';

import type { AppConfig } from '../config/env.js';
import type { SearchResult } from '../deezer/types.js';
import { getDebugOutput } from './debug.js';
import { listFiles } from './files.js';
import { registerQueueEvents } from './queue-events.js';
import {
  deezerPlaylistSchema,
  downloadSchema,
  favoritesSchema,
  filesQuerySchema,
  parseRequest,
  searchSchema,
  youtubePlaylistSchema,
  youtubeSchema,
} from './schemas.js';
import type { ApiFastifyInstance, ApiServices } from './types.js';

function accepted(reply: FastifyReply, task: QueueTask): FastifyReply {
  const body: TaskAcceptedResponse = { task_id: task.id };
  return reply.code(202).send(body);
}

export function registerApiRoutes(app: ApiFastifyInstance, config: AppConfig, services: ApiServices): void {
  const api = `${config.http.urlPrefix}/api`;
  const { deezer, scheduler } = services;

  app.post(`${api}/search`, async (request): Promise<SearchResult[]> => {
    const { query, type } = parseRequest(searchSchema, request.body);
    return deezer.deezerSearch(query, type);
  });

  app.post(`${api}/download`, async (request, reply) => {
    const body = parseRequest(downloadSchema, request.body);
    const task =
      body.type === 'track'
        ? scheduler.enqueue('Downloading track', 'download_deezer_song_and_queue', {
            track_id: String(body.music_id),
            add_to_playlist: body.add_to_playlist,
          })
        : scheduler.enqueue('Downloading album', 'download_deezer_album_and_queue_and_zip', {
            album_id: String(body.music_id),
            add_to_playlist: body.add_to_playlist,
            create_zip: body.create_zip,
          });
    return accepted(reply, task);
  });

  app.post(`${api}/youtubedl`, async (request, reply) => {
    const body = parseRequest(youtubeSchema, request.body);
    const task = scheduler.enqueue('Downloading via yt-dlp', 'download_youtubedl_and_queue', {
      video_url: body.url,
      add_to_playlist: body.add_to_playlist,
    });
    return accepted(reply, task);
  });

  app.post(`${api}/playlist/deezer`, async (request, reply) => {
    const body = parseRequest(deezerPlaylistSchema, request.body);
    const task = scheduler.enqueue('Downloading Deezer playlist', 'download_deezer_playlist_and_queue_and_zip', {
      playlist_id: body.playlist_url,
      add_to_playlist: body.add_to_playlist,
      create_zip: body.create_zip,
    });
    return accepted(reply, task);
  });

  app.post(`${api}/playlist/youtube`, async (request, reply) => {
    const body = parseRequest(youtubePlaylistSchema, request.body);
    const task = scheduler.enqueue('Downloading YouTube playlist', 'download_youtube_playlist_and_queue_and_zip', {
      playlist_url: body.url,
      add_to_playlist: body.add_to_playlist,
      create_zip: body.create_zip,
    });
    return accepted(reply, task);
  });

  app.post(`${api}/favorites/deezer`, async (request, reply) => {
    const body = parseRequest(favoritesSchema, request.body);
    const task = scheduler.enqueue('Downloading Deezer favorites', 'download_deezer_favorites', {
      user_id: body.user_id,
      add_to_playlist: body.add_to_playlist,
      create_zip: body.create_zip,
    });
    return accepted(reply, task);
  });

  app.get(`${api}/queue`, async (): Promise<QueueTask[]> => {
    return scheduler.getTasks();
  });

  registerQueueEvents(app, `${api}/queue/events`, scheduler);

  app.get(`${api}/files`, async (request): Promise<FilesResponse> => {
    const query = parseRequest(filesQuerySchema, request.query);
    return listFiles(config.downloads.baseDir, query.path ?? '');
  });

  app.get(`${api}/debug`, async (): Promise<DebugResponse> => {
    return { debug_msg: await getDebugOutput(config) };
  });
}
