import type { ApiConfigResponse, ApiErrorResponse, HealthResponse } from '@song-catcher/shared';
import Fastify, { type FastifyError } from 'fastify';
import type { Logger } from 'pino';

import type { AppConfig } from '../config/env.js';
import { VERSION } from '../version.js';
import { registerBasicAuth } from './auth.js';
import { errorResponse } from './errors.js';
import { registerApiRoutes } from './routes.js';
import { registerDownloads, registerWebApp, sendHtml } from './static.js';
import type { ApiFastifyInstance, ApiServices } from './types.js';

const NOT_FOUND: ApiErrorResponse = { error: 'not found' };

/** Health and frontend configuration; the only routes that need no service. */
function registerSystemRoutes(app: ApiFastifyInstance, config: AppConfig): void {
  const prefix = config.http.urlPrefix;

  app.get(`${prefix}/api/health`, async (): Promise<HealthResponse> => {
    return {
      status: 'ok',
      version: VERSION,
      uptimeSeconds: Math.round(process.uptime()),
    };
  });

  app.get(`${prefix}/api/config`, async (): Promise<ApiConfigResponse> => {
    return {
      version: VERSION,
      useMpd: config.mpd.enabled,
      urlPrefix: prefix,
    };
  });

  if (prefix) {
    // `/deezer` and `/deezer/` should both open the app; relative asset URLs need the slash.
    app.get(prefix, async (_request, reply) => {
      return reply.redirect(`${prefix}/`);
    });
  }
}

/**
 * Builds the HTTP server: the JSON API, the frontend and the downloaded files,
 * all below the configured URL prefix. The server is returned without listening.
 */
export async function createServer(config: AppConfig, logger: Logger, services: ApiServices) {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: false,
  });
  const prefix = config.http.urlPrefix;

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const { statusCode, body } = errorResponse(error, request.log);
    return reply.code(statusCode).send(body);
  });

  if (config.http.auth) {
    // Health stays public so container health checks work without secrets.
    registerBasicAuth(app, config.http.auth, `${prefix}/api/health`);
  }

  registerSystemRoutes(app, config);
  registerApiRoutes(app, config, services);
  const indexPage = await registerWebApp(app, prefix);
  await registerDownloads(app, config.downloads.baseDir, prefix);

  app.setNotFoundHandler((request, reply) => {
    const { url, method } = request;
    const isApiRequest = url === `${prefix}/api` || url.startsWith(`${prefix}/api/`);
    const isFileRequest = url.startsWith(`${prefix}/assets/`) || url.startsWith(`${prefix}/downloads/`);
    const isPageRequest = method === 'GET' || method === 'HEAD';

    // Any other path is a client-side route of the frontend, e.g. `/queue`.
    if (indexPage && isPageRequest && !isApiRequest && !isFileRequest) {
      return sendHtml(reply, indexPage);
    }
    return reply.code(404).send(NOT_FOUND);
  });

  return app;
}
