import { existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import type { FastifyReply } from 'fastify';

import { isPathInside } from '../lib/paths.js';
import type { ApiFastifyInstance } from './types.js';

const WEB_DIST = fileURLToPath(new URL('../../../web/dist', import.meta.url));

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

export async function registerWebApp(
  app: ApiFastifyInstance,
  prefix: string,
  webRoot = WEB_DIST,
): Promise<string | undefined> {
  if (!existsSync(webRoot)) {
    return undefined;
  }

  const indexHtml = await readFile(path.join(webRoot, 'index.html'), 'utf8');
  await app.register(fastifyStatic, {
    root: webRoot,
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
  });
}
