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
    app.get(prefix, async (_request, reply) => {
      return reply.redirect(`${prefix}/`);
    });
  }
}

export async function createServer(config: AppConfig, logger: Logger, services: ApiServices, webRoot?: string) {
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
    registerBasicAuth(app, config.http.auth, `${prefix}/api/health`);
  }

  registerSystemRoutes(app, config);
  registerApiRoutes(app, config, services);
  const indexPage = await registerWebApp(app, prefix, webRoot);
  await registerDownloads(app, config.downloads.baseDir, prefix);

  app.setNotFoundHandler((request, reply) => {
    const { url, method } = request;
    const isApiRequest = url === `${prefix}/api` || url.startsWith(`${prefix}/api/`);
    const isFileRequest = url.startsWith(`${prefix}/assets/`) || url.startsWith(`${prefix}/downloads/`);
    const isPageRequest = method === 'GET' || method === 'HEAD';

    if (indexPage && isPageRequest && !isApiRequest && !isFileRequest) {
      return sendHtml(reply, indexPage);
    }
    return reply.code(404).send({ error: 'not found' } satisfies ApiErrorResponse);
  });

  return app;
}
