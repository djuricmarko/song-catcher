import path from 'node:path';

export function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}
