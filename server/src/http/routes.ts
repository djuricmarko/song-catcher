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
    const musicId = String(body.music_id);
    const task =
      body.type === 'track'
        ? scheduler.enqueue(
            'download_deezer_song',
            { track_id: musicId, add_to_playlist: body.add_to_playlist },
            { source: 'deezer', kind: 'track', title: body.title ?? `Track ${musicId}`, subtitle: body.subtitle },
          )
        : scheduler.enqueue(
            'download_deezer_album',
            { album_id: musicId, add_to_playlist: body.add_to_playlist },
            { source: 'deezer', kind: 'album', title: body.title ?? `Album ${musicId}`, subtitle: body.subtitle },
          );
    return accepted(reply, task);
  });

  app.post(`${api}/youtubedl`, async (request, reply) => {
    const body = parseRequest(youtubeSchema, request.body);
    const task = scheduler.enqueue(
      'download_youtube',
      { video_url: body.url, add_to_playlist: body.add_to_playlist },
      { source: 'youtube', kind: 'track', title: body.url },
    );
    return accepted(reply, task);
  });

  app.post(`${api}/playlist/deezer`, async (request, reply) => {
    const body = parseRequest(deezerPlaylistSchema, request.body);
    const task = scheduler.enqueue(
      'download_deezer_playlist',
      { playlist_id: body.playlist_url, add_to_playlist: body.add_to_playlist },
      { source: 'deezer', kind: 'playlist', title: body.playlist_url },
    );
    return accepted(reply, task);
  });

  app.post(`${api}/playlist/youtube`, async (request, reply) => {
    const body = parseRequest(youtubePlaylistSchema, request.body);
    const task = scheduler.enqueue(
      'download_youtube_playlist',
      { playlist_url: body.url, add_to_playlist: body.add_to_playlist },
      { source: 'youtube', kind: 'playlist', title: body.url },
    );
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
