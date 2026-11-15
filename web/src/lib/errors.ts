/** Human-readable text for anything that can be thrown. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True when a browser API was cancelled on purpose, e.g. a dismissed dialog or an interrupted `play()`. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
