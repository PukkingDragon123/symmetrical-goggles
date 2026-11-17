import { defineConfig } from 'vite';
// a frozen dev server for automated screenshots: no HMR, no file watching
export default defineConfig({ base: './', server: { port: 5190, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } } });
