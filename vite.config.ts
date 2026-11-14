import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Relative base so the build works from a sub-path such as GitHub Pages (user.github.io/repo/).
export default defineConfig({
  base: './',
  build: {
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), lab: resolve(__dirname, 'lab.html') } },
  },
});
