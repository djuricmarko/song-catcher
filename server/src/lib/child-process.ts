/**
 * Environment for external tools (yt-dlp, metaflac). They get everything the
 * server has except the Deezer credential, which they never need.
 */
export function childEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.DEEZER_COOKIE_ARL;
  return env;
}

/**
 * The stderr captured from a failed `exec`/`execFile` call, or undefined when
 * the error carries none (e.g. the executable could not be spawned at all).
 */
export function childStderr(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    return String(error.stderr);
  }
  return undefined;
}

/** True when the child was killed, which is how `exec`/`execFile` report a timeout. */
export function wasKilled(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'killed' in error && Boolean(error.killed);
}
