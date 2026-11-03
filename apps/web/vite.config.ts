import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 4174,
    allowedHosts: true,
    proxy: {
      '/api': 'http://127.0.0.1:4822',
      '/health': 'http://127.0.0.1:4822',
      '/webhooks': 'http://127.0.0.1:4822',
    },
  },
});
