import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FastifyInstance, RawServerDefault } from 'fastify';
import type { Logger } from 'pino';

import type { DeezerClient } from '../deezer/client.js';
import type { DownloadService } from '../downloads/service.js';
import type { DownloadScheduler } from '../queue/tasks.js';

export type ApiFastifyInstance = FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, Logger>;

export interface ApiServices {
  deezer: DeezerClient;
  scheduler: DownloadScheduler;
  downloads: DownloadService;
}
