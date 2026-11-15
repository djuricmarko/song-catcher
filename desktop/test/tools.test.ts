import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checksumFor, ffmpegUrl, ytDlpAsset } from '../src/tool-assets.js';
import { builderPlatform, executableName, locateTools, searchDirectories } from '../src/tools.js';

const tempDirectories: string[] = [];

async function makeTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'song-catcher-desktop-test-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('platform naming', () => {
  it('adds .exe on Windows only', () => {
    expect(executableName('yt-dlp', 'win32')).toBe('yt-dlp.exe');
    expect(executableName('yt-dlp', 'linux')).toBe('yt-dlp');
    expect(executableName('yt-dlp', 'darwin')).toBe('yt-dlp');
  });

  it('uses the electron-builder platform names', () => {
    expect(builderPlatform('darwin')).toBe('mac');
    expect(builderPlatform('win32')).toBe('win');
    expect(builderPlatform('linux')).toBe('linux');
  });
});

describe('searchDirectories', () => {
  it('adds the directories desktop sessions leave out of PATH', () => {
    expect(searchDirectories('/usr/bin:/usr/local/bin', 'darwin')).toEqual([
      '/usr/bin',
      '/usr/local/bin',
      '/opt/homebrew/bin',
    ]);
  });

  it('splits a Windows PATH on semicolons and adds nothing', () => {
    expect(searchDirectories('C:\\Windows;C:\\Tools', 'win32')).toEqual(['C:\\Windows', 'C:\\Tools']);
    expect(searchDirectories(undefined, 'win32')).toEqual([]);
  });
});

describe('locateTools', () => {
  it('prefers the first directory that has the tool', async () => {
    const updated = await makeTempDirectory();
    const bundled = await makeTempDirectory();
    await writeFile(path.join(updated, 'yt-dlp'), '');
    await writeFile(path.join(bundled, 'yt-dlp'), '');
    await writeFile(path.join(bundled, 'ffmpeg'), '');

    expect(locateTools([updated, bundled], 'linux')).toEqual({
      'yt-dlp': path.join(updated, 'yt-dlp'),
      ffmpeg: path.join(bundled, 'ffmpeg'),
      metaflac: undefined,
    });
  });

  it('looks for .exe files on Windows', async () => {
    const directory = await makeTempDirectory();
    await writeFile(path.join(directory, 'ffmpeg.exe'), '');

    expect(locateTools([directory], 'win32').ffmpeg).toBe(path.join(directory, 'ffmpeg.exe'));
    expect(locateTools([directory], 'linux').ffmpeg).toBeUndefined();
  });
});

describe('download sources', () => {
  it.each([
    ['linux', 'x64', 'yt-dlp_linux'],
    ['linux', 'arm64', 'yt-dlp_linux_aarch64'],
    ['darwin', 'arm64', 'yt-dlp_macos'],
    ['darwin', 'x64', 'yt-dlp_macos'],
    ['win32', 'x64', 'yt-dlp.exe'],
    ['win32', 'arm64', 'yt-dlp_arm64.exe'],
  ] as const)('picks the yt-dlp build for %s-%s', (platform, arch, asset) => {
    expect(ytDlpAsset(platform, arch)).toBe(asset);
  });

  it('has no build for unsupported targets', () => {
    expect(ytDlpAsset('freebsd', 'x64')).toBeUndefined();
    expect(ffmpegUrl('win32', 'arm64')).toBeUndefined();
  });

  it('points ffmpeg at the matching static build', () => {
    expect(ffmpegUrl('darwin', 'arm64')).toMatch(/\/ffmpeg-darwin-arm64$/);
  });

  it('reads the checksum of one asset from a sums file', () => {
    const sums = ['AAA111  yt-dlp', 'BBB222  yt-dlp_linux', 'CCC333  yt-dlp_linux_aarch64'].join('\n');

    expect(checksumFor(sums, 'yt-dlp_linux')).toBe('bbb222');
    expect(checksumFor(sums, 'yt-dlp.exe')).toBeUndefined();
  });
});
