import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../src/config/env.js';
import type { DeezerClient } from '../src/deezer/client.js';
import { Deezer403Exception, Deezer404Exception, DeezerApiException } from '../src/deezer/errors.js';
import type { DownloadService } from '../src/downloads/service.js';
import { ApiValidationError, errorResponse } from '../src/http/errors.js';
import { FileAccessError } from '../src/http/files.js';
import { createServer } from '../src/http/server.js';
import { Scheduler } from '../src/queue/scheduler.js';
import type { DownloadTasks } from '../src/queue/tasks.js';

const silent = pino({ level: 'silent' });

describe('errorResponse', () => {
  it('maps expected errors to their status without logging them', () => {
    const logger = { error: vi.fn() } as unknown as pino.Logger;

    expect(errorResponse(new ApiValidationError(['query: must not be empty']), logger)).toEqual({
      statusCode: 400,
      body: { error: 'invalid request', details: ['query: must not be empty'] },
    });
    expect(errorResponse(new FileAccessError('path does not exist', 404), logger)).toEqual({
      statusCode: 404,
      body: { error: 'path does not exist' },
    });
    expect(errorResponse(new Deezer404Exception('no such album'), logger)).toEqual({
      statusCode: 404,
      body: { error: 'no such album' },
    });
    expect(errorResponse(new Deezer403Exception('not logged in'), logger)).toEqual({
      statusCode: 403,
      body: { error: 'not logged in' },
    });
    expect(errorResponse(new DeezerApiException('Deezer is down'), logger)).toEqual({
      statusCode: 502,
      body: { error: 'Deezer is down' },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs unexpected errors and hides their details', () => {
    const logger = { error: vi.fn() } as unknown as pino.Logger;
    const failure = new Error('database password is hunter2');

    expect(errorResponse(failure, logger)).toEqual({
      statusCode: 500,
      body: { error: 'internal server error' },
    });
    expect(errorResponse('not even an error', logger)).toEqual({
      statusCode: 500,
      body: { error: 'internal server error' },
    });
    expect(logger.error).toHaveBeenCalledWith({ err: failure }, 'request failed');
  });

  it('keeps the status and message of client errors raised by the framework', () => {
    const logger = { error: vi.fn() } as unknown as pino.Logger;
    const badRequest = Object.assign(new Error('Body is not valid JSON'), { statusCode: 400 });
    const brokenUpstream = Object.assign(new Error('socket hang up'), { statusCode: 503 });

    expect(errorResponse(badRequest, logger)).toEqual({
      statusCode: 400,
      body: { error: 'Body is not valid JSON' },
    });
    expect(errorResponse(brokenUpstream, logger)).toEqual({
      statusCode: 503,
      body: { error: 'internal server error' },
    });
  });
});

describe('API error handling', () => {
  let baseDirectory: string;
  let app: Awaited<ReturnType<typeof createServer>>;
  let scheduler: Scheduler<DownloadTasks>;
  let searchFailure: unknown;

  beforeEach(async () => {
    baseDirectory = await mkdtemp(path.join(tmpdir(), 'deezer-http-errors-test-'));
    const config = loadConfig(
      { DEEZER_COOKIE_ARL: 'a'.repeat(192), DEEZER_DOWNLOAD_DIR: baseDirectory },
      { cwd: baseDirectory },
    );
    scheduler = new Scheduler<DownloadTasks>(1, 10, silent);
    const deezer = {
      deezerSearch: async () => {
        throw searchFailure;
      },
    } as unknown as DeezerClient;

    app = await createServer(config, silent, { deezer, scheduler, downloads: {} as DownloadService });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await scheduler.stop();
    await rm(baseDirectory, { recursive: true, force: true });
  });

  function search() {
    return app.inject({ method: 'POST', url: '/api/search', payload: { type: 'track', query: 'x' } });
  }

  it.each([
    ['a missing page', () => new Deezer404Exception('gone'), 404, 'gone'],
    ['a lost login', () => new Deezer403Exception('log in again'), 403, 'log in again'],
    ['an upstream failure', () => new DeezerApiException('Deezer is down'), 502, 'Deezer is down'],
    ['a bug', () => new Error('secret detail'), 500, 'internal server error'],
  ])('answers %s thrown by a route', async (_name, makeError, statusCode, message) => {
    searchFailure = makeError();

    const response = await search();

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({ error: message });
  });

  it('answers a task that cannot be enqueued with a 500', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/youtubedl',
      payload: { url: 'https://example.com/video', add_to_playlist: false },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'internal server error' });
  });

  it('answers malformed JSON with a 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/search',
      headers: { 'content-type': 'application/json' },
      payload: '{"type": ',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty('error');
  });

  it('answers a file listing outside the download directory with the file error status', async () => {
    const escape = await app.inject({ method: 'GET', url: '/api/files?path=../..' });
    const missing = await app.inject({ method: 'GET', url: '/api/files?path=nope' });

    expect(escape.statusCode).toBe(403);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'path does not exist' });
  });
});
