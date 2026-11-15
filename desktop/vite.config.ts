import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'renderer',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist/settings',
    emptyOutDir: true,
  },
});
