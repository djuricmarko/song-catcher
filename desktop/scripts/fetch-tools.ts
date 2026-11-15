import path from 'node:path';

import { downloadFfmpeg, downloadYtDlp } from '../src/tool-assets.js';
import { builderPlatform, executableName } from '../src/tools.js';

const directory = path.resolve(import.meta.dirname, '../vendor', `${builderPlatform()}-${process.arch}`);

await Promise.all([
  downloadYtDlp(path.join(directory, executableName('yt-dlp')), process.platform, process.arch),
  downloadFfmpeg(path.join(directory, executableName('ffmpeg')), process.platform, process.arch),
]);

console.log(`yt-dlp and ffmpeg for ${process.platform}-${process.arch} are in ${directory}`);
