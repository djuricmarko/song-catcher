import { existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import type { FastifyReply } from 'fastify';

import { isPathInside } from '../lib/paths.js';
import type { ApiFastifyInstance } from './types.js';

const WEB_DIST = fileURLToPath(new URL('../../../web/dist', import.meta.url));

export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function renderIndexPage(indexHtml: string, prefix: string): string {
  const runtimeConfig = { apiRoot: `${prefix}/api`, appRoot: prefix };
  return indexHtml.replace(
    '<head>',
    `<head>\n    <base href="${prefix}/" />\n    <script>window.__APP_CONFIG__ = ${JSON.stringify(
      runtimeConfig,
    )};</script>`,
  );
}

export function sendHtml(reply: FastifyReply, html: string): FastifyReply {
  return reply.type('text/html; charset=utf-8').send(html);
}

export async function registerWebApp(app: ApiFastifyInstance, prefix: string): Promise<string | undefined> {
  if (!existsSync(WEB_DIST)) {
    return undefined;
  }

  const indexHtml = await readFile(path.join(WEB_DIST, 'index.html'), 'utf8');
  await app.register(fastifyStatic, {
    root: WEB_DIST,
    prefix: `${prefix}/`,
    index: false,
  });

  const indexPage = renderIndexPage(indexHtml, prefix);
  app.get(`${prefix}/`, async (_request, reply) => sendHtml(reply, indexPage));
  return indexPage;
}

export async function registerDownloads(app: ApiFastifyInstance, baseDir: string, prefix: string): Promise<void> {
  if (!existsSync(baseDir)) {
    return;
  }

  await app.register(fastifyStatic, {
    root: baseDir,
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
