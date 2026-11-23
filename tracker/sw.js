/* Версия кэша = cache-bust трекера. При релизе подними вместе с ?v= в index.html. */
const VERSION = '0.7.12';
const CACHE = `padel-tracker-v${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  `./styles.css?v=${VERSION}`,
  `./js/app.js?v=${VERSION}`,
  './js/app.js',
  './js/backup.js',
  './js/fixed.js',
  './js/formats.js',
  './js/pairing.js',
  './js/pairs.js',
  './js/qualification.js',
  './js/render.js',
  './js/rng.js',
  './js/scoring.js',
  './js/standings.js',
  './js/state.js',
  './js/wheel.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit;
      return fetch(event.request)
        .then((res) => res)
        .catch(() => caches.match('./index.html'));
    }),
  );
});
