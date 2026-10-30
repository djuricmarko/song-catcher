import { readFileSync } from 'node:fs';

function readVersion(): string {
  try {
    const contents = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(contents) as { version?: string };
    return parsed.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const VERSION = readVersion();
