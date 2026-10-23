import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Im Dev-Modus laufen API und Share-Seiten in `wrangler dev` (Port 8787).
const api = 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': api, '/v/': api },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // three.js + React Three Fiber (~270 KB gzip) liegen bewusst in einem eigenen, erst im
    // Auto-Designer nachgeladenen Chunk.
    chunkSizeWarningLimit: 1100,
  },
});
