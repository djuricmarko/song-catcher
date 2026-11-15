/** Encodes a slash-separated path for use in a URL, keeping the slashes. */
export function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/** The last segment of a path, whichever kind of slash it uses. */
export function basename(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

/** The lower-cased extension of a file name without the dot; empty when there is none. */
export function fileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}
