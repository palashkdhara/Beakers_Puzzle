import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Beakers_Puzzle/',
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    minify: false,
    sourcemap: false
  }
});
