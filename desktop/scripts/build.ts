import { build, type BuildOptions } from 'esbuild';

const node: BuildOptions = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
};

await build({
  ...node,
  entryPoints: { main: 'src/main.ts', 'server-process': 'src/server-process.ts' },
  outdir: 'dist',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  alias: {
    '@song-catcher/server': '../server/src/index.ts',
    '@song-catcher/shared': '../shared/src/index.ts',
  },
  banner: {
    js: [
      "import { createRequire as bundleCreateRequire } from 'node:module';",
      "import { fileURLToPath as bundleFileURLToPath } from 'node:url';",
      "import { dirname as bundleDirname } from 'node:path';",
      'const require = bundleCreateRequire(import.meta.url);',
      'const __filename = bundleFileURLToPath(import.meta.url);',
      'const __dirname = bundleDirname(__filename);',
    ].join('\n'),
  },
});

await build({
  ...node,
  entryPoints: { preload: 'src/preload.ts', 'app-preload': 'src/app-preload.ts' },
  outdir: 'dist',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
});
