import path from 'node:path';

/** True when `child` is `parent` itself or lies anywhere below it. Both must be absolute. */
export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Converts a platform path to forward slashes, as used in URLs and by MPD. */
export function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}
