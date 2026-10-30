import { existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import type {
  ApiConfigResponse,
  ApiErrorResponse,
  HealthResponse,
} from '@deezer-downloader/shared';
import Fastify, { type FastifyError } from 'fastify';
import type { Logger } from 'pino';

import { isPathInside, type AppConfig } from '../config/env.js';
import { VERSION } from '../version.js';
import { registerApiRoutes, type ApiServices } from './routes.js';

const WEB_DIST = fileURLToPath(new URL('../../../web/dist', import.meta.url));

export async function createServer(config: AppConfig, logger: Logger, services: ApiServices) {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: false,
  });

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

  app.get(`${prefix}/config.js`, async (_request, reply) => {
    const runtimeConfig = {
      apiRoot: `${prefix}/api`,
      appRoot: prefix,
    };
    return reply
      .type('application/javascript; charset=utf-8')
      .send(`window.__APP_CONFIG__ = ${JSON.stringify(runtimeConfig)};\n`);
  });

  if (prefix) {
    app.get(prefix, async (_request, reply) => {
      return reply.redirect(`${prefix}/`);
    });
  }

  await registerApiRoutes(app, config, services);

  let indexHtml: string | undefined;
  if (existsSync(WEB_DIST)) {
    indexHtml = await readFile(path.join(WEB_DIST, 'index.html'), 'utf8');
    await app.register(fastifyStatic, {
      root: WEB_DIST,
      prefix: `${prefix}/`,
      index: false,
    });
  }

  const renderIndex = (): string | undefined => {
    if (!indexHtml) {
      return undefined;
    }
    const baseHref = `${prefix}/`;
    const runtimeConfig = {
      apiRoot: `${prefix}/api`,
      appRoot: prefix,
    };
    return indexHtml.replace(
      '<head>',
      `<head>\n    <base href="${baseHref}" />\n    <script>window.__APP_CONFIG__ = ${JSON.stringify(
        runtimeConfig,
      )};</script>`,
    );
  };

  if (indexHtml) {
    app.get(`${prefix}/`, async (_request, reply) => {
      return reply.type('text/html; charset=utf-8').send(renderIndex());
    });
  }

  if (existsSync(config.downloads.baseDir)) {
    await app.register(fastifyStatic, {
      root: config.downloads.baseDir,
      prefix: `${prefix}/downloads/`,
      decorateReply: false,
      index: false,
      list: false,
      allowedPath: (pathname, root) => {
        try {
          const decoded = decodeURIComponent(pathname);
          const rootPath = String(root);
          const resolved = path.resolve(rootPath, `.${decoded}`);
          return isPathInside(realpathSync(rootPath), realpathSync(resolved));
        } catch {
          return false;
        }
      },
      setHeaders: (response, filePath) => {
        if (filePath.endsWith('.zip')) {
          response.header(
            'Content-Disposition',
            `attachment; filename="${path.basename(filePath)}"`,
          );
        }
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url === `${prefix}/api` || request.url.startsWith(`${prefix}/api/`)) {
      const body: ApiErrorResponse = { error: 'not found' };
      return reply.code(404).send(body);
    }
    if (
      request.url.startsWith(`${prefix}/assets/`) ||
      request.url.startsWith(`${prefix}/downloads/`)
    ) {
      const body: ApiErrorResponse = { error: 'not found' };
      return reply.code(404).send(body);
    }
    if (existsSync(WEB_DIST) && (request.method === 'GET' || request.method === 'HEAD')) {
      const html = renderIndex();
      if (html) {
        return reply.type('text/html; charset=utf-8').send(html);
      }
    }
    const body: ApiErrorResponse = { error: 'not found' };
    return reply.code(404).send(body);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, 'request failed');
    const statusCode =
      typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    const body: ApiErrorResponse = {
      error: statusCode >= 500 ? 'internal server error' : error.message,
    };
    return reply.code(statusCode).send(body);
  });

  return app;
}
