import { createReadStream, existsSync, statSync, cpSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const configDir = dirname(fileURLToPath(import.meta.url));
const trackerSrc = resolve(configDir, '../../tracker');
const trackerDest = resolve(configDir, 'dist/tracker');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

function shouldCopyTrackerPath(filePath: string): boolean {
  if (filePath === trackerSrc) return true;
  const rel = filePath.slice(trackerSrc.length).replace(/^[/\\]/, '');
  const top = rel.split(/[/\\]/)[0];
  if (top === 'test' || top === 'screenshots' || top === 'package.json') return false;
  if (rel.endsWith('.md')) return false;
  return true;
}

function copyTrackerIntoDist() {
  mkdirSync(trackerDest, { recursive: true });
  cpSync(trackerSrc, trackerDest, { recursive: true, filter: shouldCopyTrackerPath });
}

/** Мини-турнир: /tracker/ в dev и в apps/web/dist/tracker после сборки Pages. */
function trackerPagesPlugin(): Plugin {
  return {
    name: 'padel-tracker-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith('/tracker')) {
          next();
          return;
        }
        const rel = url.slice('/tracker'.length).replace(/^\/+/, '') || 'index.html';
        let file = resolve(trackerSrc, rel);
        if (!file.startsWith(trackerSrc)) {
          next();
          return;
        }
        if (existsSync(file) && statSync(file).isDirectory()) {
          file = join(file, 'index.html');
        }
        if (!existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      copyTrackerIntoDist();
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react(), trackerPagesPlugin()],
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
