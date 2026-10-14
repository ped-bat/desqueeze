import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 1422,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 4096,
  },
});
