const CACHE_NAME = '8fulfill-v21';
const VENDOR_ASSETS = [
  './vendor/exceljs.min.js',
  './vendor/jszip.min.js'
];

const APP_FILE_PATHS = new Set([
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/template-base64.js',
  '/manifest.webmanifest',
  '/sw.js'
]);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(VENDOR_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  if (APP_FILE_PATHS.has(url.pathname)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
