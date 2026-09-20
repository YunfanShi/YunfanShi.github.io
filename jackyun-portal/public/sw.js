const CACHE_PREFIX = 'jackyun-pwa';
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `${CACHE_PREFIX}-static-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/Webicon.png',
  '/jackyun-icon.svg',
  '/jackyun-icon-192.png',
];

const STATIC_PATH_PREFIXES = ['/_next/static/'];
const STATIC_FILE_PATTERN = /\.(?:css|js|mjs|woff2?|ttf|otf|png|jpg|jpeg|gif|webp|svg|ico)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached ?? Response.error();
    }));
    return;
  }

  const immutableNextAsset = STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  const cacheableStaticAsset = immutableNextAsset || STATIC_FILE_PATTERN.test(url.pathname);
  if (!cacheableStaticAsset) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (immutableNextAsset && cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});
