import type { IncomingMessage, ServerResponse } from 'node:http';

import type {
  ApiErrorResponse,
  DebugResponse,
  QueueTask,
  TaskAcceptedResponse,
} from '@deezer-downloader/shared';
import type { FastifyBaseLogger, FastifyInstance, FastifyReply, RawServerDefault } from 'fastify';
import type { Logger } from 'pino';
import { z, type ZodType } from 'zod';

import type { AppConfig } from '../config/env.js';
import {
  Deezer403Exception,
  Deezer404Exception,
  DeezerApiException,
  type DeezerClient,
} from '../deezer/client.js';
import type { DownloadService } from '../downloads/service.js';
import type { Scheduler } from '../queue/scheduler.js';
import { getDebugOutput } from './debug.js';
import { FileAccessError, listFiles } from './files.js';

export interface ApiServices {
  deezer: DeezerClient;
  scheduler: Scheduler;
  downloads: DownloadService;
}

class ApiValidationError extends Error {
  public constructor(public readonly details: string[]) {
    super('invalid request');
    this.name = 'ApiValidationError';
  }
}

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiValidationError(
      result.error.issues.map((issue) => {
        const key = issue.path.join('.') || 'body';
        return `${key}: ${issue.message}`;
      }),
    );
  }
  return result.data;
}

function handleApiError(
  reply: FastifyReply,
  error: unknown,
  logger: FastifyBaseLogger,
): FastifyReply {
  if (error instanceof ApiValidationError) {
    const body: ApiErrorResponse = { error: 'invalid request', details: error.details };
    return reply.code(400).send(body);
  }
  if (error instanceof FileAccessError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  if (error instanceof Deezer404Exception) {
    return reply.code(404).send({ error: error.message });
  }
  if (error instanceof Deezer403Exception) {
    return reply.code(403).send({ error: error.message });
  }
  if (error instanceof DeezerApiException) {
    return reply.code(502).send({ error: error.message });
  }

  logger.error({ err: error }, 'API request failed');
  return reply.code(500).send({ error: 'internal server error' });
}

const searchSchema = z
  .object({
    type: z.enum(['track', 'album', 'artist', 'album_track', 'artist_album', 'artist_top']),
    query: z.string().trim().min(1, 'must not be empty'),
  })
  .strict();

const downloadSchema = z
  .object({
    type: z.enum(['track', 'album']),
    music_id: z.coerce.number().int().positive(),
    add_to_playlist: z.boolean(),
    create_zip: z.boolean(),
  })
  .strict();

const youtubeSchema = z
  .object({
    url: z
      .string()
      .trim()
      .url()
      .refine((value) => value.startsWith('http'), 'must start with http'),
    add_to_playlist: z.boolean(),
  })
  .strict();

const playlistSchema = z
  .object({
    playlist_url: z.string().trim().min(1, 'must not be empty'),
    add_to_playlist: z.boolean(),
    create_zip: z.boolean(),
  })
  .strict();

const favoritesSchema = z
  .object({
    user_id: z.string().trim().regex(/^\d+$/, 'must be a numeric string'),
    add_to_playlist: z.boolean(),
    create_zip: z.boolean(),
  })
  .strict();

const filesQuerySchema = z.object({
  path: z.string().optional(),
});

export type ApiFastifyInstance = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse,
  Logger
>;

export async function registerApiRoutes(
  app: ApiFastifyInstance,
  config: AppConfig,
  services: ApiServices,
): Promise<void> {
  const api = `${config.http.urlPrefix}/api`;

  app.post(`${api}/search`, async (request, reply) => {
    try {
      const body = parseBody(searchSchema, request.body);
      return await services.deezer.deezerSearch(body.query, body.type);
    } catch (error) {
      return handleApiError(reply, error, request.log);
    }
  });

  app.post(`${api}/download`, async (request, reply) => {
    try {
      const body = parseBody(downloadSchema, request.body);
      const task =
        body.type === 'track'
          ? services.scheduler.enqueue('Downloading track', 'download_deezer_song_and_queue', {
              track_id: String(body.music_id),
              add_to_playlist: body.add_to_playlist,
            })
          : services.scheduler.enqueue(
              'Downloading album',
              'download_deezer_album_and_queue_and_zip',
              {
                album_id: String(body.music_id),
                add_to_playlist: body.add_to_playlist,
                create_zip: body.create_zip,
              },
            );
      const response: TaskAcceptedResponse = { task_id: task.id };
      return reply.code(202).send(response);
    } catch (error) {
      return handleApiError(reply, error, request.log);
    }
  });

  app.post(`${api}/youtubedl`, async (request, reply) => {
    try {
      const body = parseBody(youtubeSchema, request.body);
      const task = services.scheduler.enqueue(
        'Downloading via yt-dlp',
        'download_youtubedl_and_queue',
        {
          video_url: body.url,
          add_to_playlist: body.add_to_playlist,
        },
      );
      const response: TaskAcceptedResponse = { task_id: task.id };
      return reply.code(202).send(response);
    } catch (error) {
      return handleApiError(reply, error, request.log);
    }
  });

  app.post(`${api}/playlist/deezer`, async (request, reply) => {
    try {
      const body = parseBody(playlistSchema, request.body);
      const task = services.scheduler.enqueue(
        'Downloading Deezer playlist',
        'download_deezer_playlist_and_queue_and_zip',
        {
          playlist_id: body.playlist_url,
          add_to_playlist: body.add_to_playlist,
          create_zip: body.create_zip,
        },
      );
      const response: TaskAcceptedResponse = { task_id: task.id };
      return reply.code(202).send(response);
    } catch (error) {
      return handleApiError(reply, error, request.log);
    }
  });

  app.post(`${api}/favorites/deezer`, async (request, reply) => {
    try {
      const body = parseBody(favoritesSchema, request.body);
      const task = services.scheduler.enqueue(
        'Downloading Deezer favorites',
        'download_deezer_favorites',
        {
          user_id: body.user_id,
          add_to_playlist: body.add_to_playlist,
          create_zip: body.create_zip,
        },
      );
      const response: TaskAcceptedResponse = { task_id: task.id };
      return reply.code(202).send(response);
    } catch (error) {
      return handleApiError(reply, error, request.log);
    }
  });

  app.get(`${api}/queue`, async (): Promise<QueueTask[]> => {
    return services.scheduler.getTasks();
  });

  app.get(`${api}/queue/events`, (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const writeEvent = (event: string, data: unknown): void => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    writeEvent('snapshot', services.scheduler.getTasks());
    const unsubscribe = services.scheduler.subscribe((task) => {
      writeEvent('task', task);
    });
    const heartbeat = setInterval(() => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(': heartbeat\n\n');
      }
    }, 15_000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.get(`${api}/files`, async (request, reply) => {
    try {
      const query = parseBody(filesQuerySchema, request.query);
      return await listFiles(config.downloads.baseDir, query.path ?? '');
    } catch (error) {
      return handleApiError(reply, error, request.log);
    }
  });

  app.get(`${api}/debug`, async (request, reply): Promise<DebugResponse | FastifyReply> => {
    try {
      return { debug_msg: await getDebugOutput(config) };
    } catch (error) {
      return handleApiError(reply, error, request.log);
    }
  });
}
