import { timingSafeEqual } from 'node:crypto';

import type { ApiErrorResponse } from '@song-catcher/shared';

import type { AppConfig } from '../config/env.js';
import type { ApiFastifyInstance } from './types.js';

type Credentials = NonNullable<AppConfig['http']['auth']>;

function safeEqual(first: string, second: string): boolean {
  const a = Buffer.from(first, 'utf8');
  const b = Buffer.from(second, 'utf8');
  // Compare against itself on length mismatch to keep timing uniform.
  return a.length === b.length ? timingSafeEqual(a, b) : !timingSafeEqual(a, a);
}

export function checkBasicAuth(header: string | undefined, expected: Credentials): boolean {
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

export function registerBasicAuth(app: ApiFastifyInstance, credentials: Credentials, publicPath: string): void {
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.split('?')[0] === publicPath) {
      return;
    }
    if (!checkBasicAuth(request.headers.authorization, credentials)) {
      const body: ApiErrorResponse = { error: 'authentication required' };
      return reply.code(401).header('WWW-Authenticate', 'Basic realm="song-catcher", charset="UTF-8"').send(body);
    }
  });
}
