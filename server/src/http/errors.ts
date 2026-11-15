import type { ApiErrorResponse } from '@song-catcher/shared';
import type { FastifyBaseLogger } from 'fastify';

import { Deezer403Exception, Deezer404Exception, DeezerApiException } from '../deezer/errors.js';
import { FileAccessError } from './files.js';

export class ApiValidationError extends Error {
  public constructor(public readonly details: string[]) {
    super('invalid request');
    this.name = 'ApiValidationError';
  }
}

export interface ErrorResponse {
  statusCode: number;
  body: ApiErrorResponse;
}

function expectedErrorResponse(error: unknown): ErrorResponse | undefined {
  if (error instanceof ApiValidationError) {
    return { statusCode: 400, body: { error: 'invalid request', details: error.details } };
  }
  if (error instanceof FileAccessError) {
    return { statusCode: error.statusCode, body: { error: error.message } };
  }
  if (error instanceof Deezer404Exception) {
    return { statusCode: 404, body: { error: error.message } };
  }
  if (error instanceof Deezer403Exception) {
    return { statusCode: 403, body: { error: error.message } };
  }
  if (error instanceof DeezerApiException) {
    return { statusCode: 502, body: { error: error.message } };
  }
  return undefined;
}

function httpStatusOf(error: unknown): number {
  const statusCode =
    typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
  return typeof statusCode === 'number' && statusCode >= 400 ? statusCode : 500;
}

export function errorResponse(error: unknown, logger: FastifyBaseLogger): ErrorResponse {
  const expected = expectedErrorResponse(error);
  if (expected) {
    return expected;
  }

  logger.error({ err: error }, 'request failed');
  const statusCode = httpStatusOf(error);
  const message = statusCode < 500 && error instanceof Error ? error.message : 'internal server error';
  return { statusCode, body: { error: message } };
}
