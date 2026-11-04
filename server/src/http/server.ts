import { timingSafeEqual } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import type { ApiConfigResponse, ApiErrorResponse, HealthResponse } from '@deezer-downloader/shared';
import Fastify, { type FastifyError } from 'fastify';
import type { Logger } from 'pino';

import { isPathInside, type AppConfig } from '../config/env.js';
import { VERSION } from '../version.js';
import { registerApiRoutes, type ApiServices } from './routes.js';

const WEB_DIST = fileURLToPath(new URL('../../../web/dist', import.meta.url));

/**
 * Builds an RFC 6266 attachment header. HTTP header values must be Latin-1,
 * so non-ASCII names go in `filename*` (RFC 5987) with an ASCII fallback.
 */
export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function safeEqual(first: string, second: string): boolean {
  const a = Buffer.from(first, 'utf8');
  const b = Buffer.from(second, 'utf8');
  // Compare against itself on length mismatch to keep timing uniform.
  return a.length === b.length ? timingSafeEqual(a, b) : !timingSafeEqual(a, a);
}

/** Returns true when the Authorization header carries the configured credentials. */
export function checkBasicAuth(header: string | undefined, expected: { user: string; password: string }): boolean {
  const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(header ?? '');
  if (!match?.[1]) {
    return false;
  }
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator === -1) {
    return false;
  }
  const userOk = safeEqual(decoded.slice(0, separator), expected.user);
  const passwordOk = safeEqual(decoded.slice(separator + 1), expected.password);
  return userOk && passwordOk;
}

export async function createServer(config: AppConfig, logger: Logger, services: ApiServices) {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: false,
  });

  const prefix = config.http.urlPrefix;

  const auth = config.http.auth;
  if (auth) {
    const healthPath = `${prefix}/api/health`;
    app.addHook('onRequest', async (request, reply) => {
      // Health stays public so container health checks work without secrets.
      if (request.url.split('?')[0] === healthPath) {
        return;
      }
      if (!checkBasicAuth(request.headers.authorization, auth)) {
        const body: ApiErrorResponse = { error: 'authentication required' };
        return reply
          .code(401)
          .header('WWW-Authenticate', 'Basic realm="deezer-downloader", charset="UTF-8"')
          .send(body);
      }
    });
  }

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

  // The runtime config is inlined into index.html; render it once.
  const runtimeConfig = { apiRoot: `${prefix}/api`, appRoot: prefix };
  const renderedIndex = indexHtml?.replace(
    '<head>',
    `<head>\n    <base href="${prefix}/" />\n    <script>window.__APP_CONFIG__ = ${JSON.stringify(
      runtimeConfig,
    )};</script>`,
  );
  const renderIndex = (): string | undefined => renderedIndex;

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
      // `pathname` is already URL-decoded by Fastify; decoding it again breaks
      // filenames containing `%` (e.g. "100% Pure.mp3").
      allowedPath: (pathname, root) => {
        try {
          const rootPath = String(root);
          const resolved = path.resolve(rootPath, `.${pathname}`);
          return isPathInside(realpathSync(rootPath), realpathSync(resolved));
        } catch {
          return false;
        }
      },
      setHeaders: (response, filePath) => {
        if (filePath.endsWith('.zip')) {
          response.header('Content-Disposition', contentDisposition(path.basename(filePath)));
        }
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url === `${prefix}/api` || request.url.startsWith(`${prefix}/api/`)) {
      const body: ApiErrorResponse = { error: 'not found' };
      return reply.code(404).send(body);
    }
    if (request.url.startsWith(`${prefix}/assets/`) || request.url.startsWith(`${prefix}/downloads/`)) {
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
    const statusCode = typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    const body: ApiErrorResponse = {
      error: statusCode >= 500 ? 'internal server error' : error.message,
    };
    return reply.code(statusCode).send(body);
  });

  return app;
}
