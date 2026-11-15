import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FastifyInstance, RawServerDefault } from 'fastify';
import type { Logger } from 'pino';

import type { DeezerClient } from '../deezer/client.js';
import type { DownloadService } from '../downloads/service.js';
import type { DownloadScheduler } from '../queue/tasks.js';

/** The Fastify instance of this app, typed with its pino logger. */
export type ApiFastifyInstance = FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, Logger>;

/** Everything the HTTP layer delegates to. */
export interface ApiServices {
  deezer: DeezerClient;
  scheduler: DownloadScheduler;
  downloads: DownloadService;
}
