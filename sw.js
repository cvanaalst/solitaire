const CACHE = 'solitaire-v8';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/main.js',
  './src/engine.js',
  './src/cards.js',
  './src/variants.js',
  './src/layout.js',
  './src/render.js',
  './src/input.js',
  './src/persist.js',
  './src/rules.js',
  './src/stats.js',
  './src/deals.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

const NETWORK_TIMEOUT = 3000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('network timeout')), ms)),
  ]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function handle(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT);
    if (response && response.status === 200 && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(handle(request));
});
