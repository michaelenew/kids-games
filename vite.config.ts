import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works from any folder or static host.
  base: './',
  server: { host: true },
  build: {
    chunkSizeWarningLimit: 6000,
    // One site, three pages: the welcome screen picks a game, and each game
    // has its own folder so a link (or home-screen icon) goes straight to it.
    rollupOptions: {
      input: {
        welcome: resolve(__dirname, 'index.html'),
        mechaForge: resolve(__dirname, 'mecha-forge/index.html'),
        unicornRancher: resolve(__dirname, 'unicorn-rancher/index.html'),
      },
    },
  },
});
