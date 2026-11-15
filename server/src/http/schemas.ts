import type {
  DeezerPlaylistDownloadRequest,
  DownloadRequest,
  FavoritesDownloadRequest,
  SearchRequest,
  YoutubeDownloadRequest,
  YoutubePlaylistDownloadRequest,
} from '@song-catcher/shared';
import { z, type ZodType } from 'zod';

import { SEARCH_TYPES } from '../deezer/types.js';
import { ApiValidationError } from './errors.js';

/**
 * Request schemas. `satisfies ZodType<...>` ties each one to the request type
 * the frontend uses, so the two cannot drift apart unnoticed.
 */

const httpUrl = z
  .string()
  .trim()
  .pipe(z.url())
  .refine((value) => value.startsWith('http'), 'must start with http');

export const searchSchema = z
  .object({
    type: z.enum(SEARCH_TYPES),
    query: z.string().trim().min(1, 'must not be empty'),
  })
  .strict() satisfies ZodType<SearchRequest>;

export const downloadSchema = z
  .object({
    type: z.enum(['track', 'album']),
    music_id: z.coerce.number().int().positive(),
    add_to_playlist: z.boolean(),
    create_zip: z.boolean(),
  })
  .strict() satisfies ZodType<DownloadRequest>;

export const youtubeSchema = z
  .object({
    url: httpUrl,
    add_to_playlist: z.boolean(),
  })
  .strict() satisfies ZodType<YoutubeDownloadRequest>;

export const youtubePlaylistSchema = z
  .object({
    url: httpUrl,
    add_to_playlist: z.boolean(),
    create_zip: z.boolean(),
  })
  .strict() satisfies ZodType<YoutubePlaylistDownloadRequest>;

export const deezerPlaylistSchema = z
  .object({
    playlist_url: z.string().trim().min(1, 'must not be empty'),
    add_to_playlist: z.boolean(),
    create_zip: z.boolean(),
  })
  .strict() satisfies ZodType<DeezerPlaylistDownloadRequest>;

export const favoritesSchema = z
  .object({
    user_id: z.string().trim().regex(/^\d+$/, 'must be a numeric string'),
    add_to_playlist: z.boolean(),
    create_zip: z.boolean(),
  })
  .strict() satisfies ZodType<FavoritesDownloadRequest>;

export const filesQuerySchema = z.object({
  path: z.string().optional(),
});

/** Validates a request body or query string, throwing an ApiValidationError that lists every problem. */
export function parseRequest<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiValidationError(
      result.error.issues.map((issue) => {
        const key = issue.path.join('.') || 'body';
        return `${key}: ${issue.message}`;
      }),
    );
  }
  return result.data;
}
