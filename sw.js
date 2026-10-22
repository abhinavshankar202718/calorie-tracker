const CACHE_NAME = 'calorie-tracker-v7';

const CACHE_FILES = [
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './log.js',
  './foods.js',
  './meals.js',
  './settings.js',
  './scanner.js',
  './waist.js',
  './export.js',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Always fetch from network (never cache):
  //   · Open Food Facts barcode lookups
  //   · html5-qrcode library from CDN
  if (event.request.url.includes('openfoodfacts.org')  ||
      event.request.url.includes('jsdelivr.net')        ||
      event.request.url.includes('unpkg.com')) return;

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
