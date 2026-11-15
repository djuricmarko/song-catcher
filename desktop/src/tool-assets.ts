import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, mkdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const YT_DLP_RELEASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';

export function ytDlpAsset(platform: NodeJS.Platform, arch: string): string | undefined {
  const assets: Record<string, string> = {
    'linux-x64': 'yt-dlp_linux',
    'linux-arm64': 'yt-dlp_linux_aarch64',
    'darwin-x64': 'yt-dlp_macos',
    'darwin-arm64': 'yt-dlp_macos',
    'win32-x64': 'yt-dlp.exe',
    'win32-arm64': 'yt-dlp_arm64.exe',
  };
  return assets[`${platform}-${arch}`];
}

export function ffmpegUrl(platform: NodeJS.Platform, arch: string): string | undefined {
  const target = `${platform}-${arch}`;
  if (!['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64'].includes(target)) {
    return undefined;
  }
  return `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-${target}`;
}

export function checksumFor(sums: string, asset: string): string | undefined {
  for (const line of sums.split(/\r?\n/)) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === asset) {
      return hash?.toLowerCase();
    }
  }
  return undefined;
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status} ${response.statusText}): ${url}`);
  }
  return response;
}

async function download(url: string, destination: string, expectedSha256?: string): Promise<void> {
  const partial = `${destination}.part`;
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    const { body } = await fetchOk(url);
    if (!body) {
      throw new Error(`Download returned no data: ${url}`);
    }
    await pipeline(Readable.fromWeb(body), createWriteStream(partial));
    if (expectedSha256) {
      const actual = createHash('sha256')
        .update(await readFile(partial))
        .digest('hex');
      if (actual !== expectedSha256) {
        throw new Error(`Checksum mismatch for ${url}`);
      }
    }
    await chmod(partial, 0o755);
    await rename(partial, destination);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

export async function downloadYtDlp(destination: string, platform: NodeJS.Platform, arch: string): Promise<void> {
  const asset = ytDlpAsset(platform, arch);
  if (!asset) {
    throw new Error(`There is no yt-dlp build for ${platform}-${arch}`);
  }
  const sums = await (await fetchOk(`${YT_DLP_RELEASE}/SHA2-256SUMS`)).text();
  const checksum = checksumFor(sums, asset);
  if (!checksum) {
    throw new Error(`The yt-dlp release lists no checksum for ${asset}`);
  }
  await download(`${YT_DLP_RELEASE}/${asset}`, destination, checksum);
}

export async function downloadFfmpeg(destination: string, platform: NodeJS.Platform, arch: string): Promise<void> {
  const url = ffmpegUrl(platform, arch);
  if (!url) {
    throw new Error(`There is no ffmpeg build for ${platform}-${arch}`);
  }
  await download(url, destination);
}
