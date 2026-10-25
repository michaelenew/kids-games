import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works from any folder or static host.
  base: './',
  server: { host: true },
  build: { chunkSizeWarningLimit: 2000 },
});
