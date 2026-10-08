import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The backend URL is held in a variable named plain `VITE`, which the default `VITE_` prefix would not expose.
  envPrefix: ['VITE_', 'VITE'],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // Bind IPv4 explicitly: the default localhost binding resolves to ::1 only on this machine.
    host: '127.0.0.1',
    port: 3000,
    // Calls to /api go to the backend, so the dashboard uses one origin in development.
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
