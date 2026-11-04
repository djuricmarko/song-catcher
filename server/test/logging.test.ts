import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { tailFile } from '../src/http/debug.js';
import { rotateLogFile } from '../src/logging.js';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'deezer-logging-test-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('tailFile', () => {
  it('returns the last lines of a small file', async () => {
    const file = path.join(directory, 'app.log');
    await writeFile(file, 'one\ntwo\nthree\n');
    expect(await tailFile(file, 2)).toBe('two\nthree');
  });

  it('reads only the end of a large file and drops the partial first line', async () => {
    const file = path.join(directory, 'big.log');
    const lines = Array.from({ length: 5000 }, (_value, index) => `line ${index}`);
    await writeFile(file, `${lines.join('\n')}\n`);

    const tail = await tailFile(file, 100, 1024);
    const tailLines = tail.split('\n');
    expect(tailLines.at(-1)).toBe('line 4999');
    expect(tailLines.every((line) => /^line \d+$/.test(line))).toBe(true);
    expect(tailLines.length).toBeLessThanOrEqual(100);
  });
});

describe('rotateLogFile', () => {
  it('moves an oversized log aside and keeps small ones', async () => {
    const file = path.join(directory, 'app.log');
    await writeFile(file, 'x'.repeat(20));
    expect(rotateLogFile(file, 100)).toBe(false);

    expect(rotateLogFile(file, 10)).toBe(true);
    expect(await readFile(`${file}.1`, 'utf8')).toBe('x'.repeat(20));
    expect(rotateLogFile(path.join(directory, 'missing.log'), 10)).toBe(false);
  });
});
