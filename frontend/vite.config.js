import { defineConfig } from 'vite';

// In development the Vite server proxies API and WebSocket calls to the Python backend.
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true }
    }
  }
});
