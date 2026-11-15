export function childEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.DEEZER_COOKIE_ARL;
  return env;
}

export function childStderr(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'stderr' in error) {
    return String(error.stderr);
  }
  return undefined;
}

export function wasKilled(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'killed' in error && Boolean(error.killed);
}
