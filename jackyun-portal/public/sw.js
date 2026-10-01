const CACHE_PREFIX = 'jackyun-pwa';
const CACHE_VERSION = 'v4';
const STATIC_CACHE = `${CACHE_PREFIX}-static-${CACHE_VERSION}`;
const NAVIGATION_CACHE = `${CACHE_PREFIX}-pages-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/Webicon.png',
  '/jackyun-icon-192.png',
  '/jackyun-logo.png',
];

const STATIC_PATH_PREFIXES = ['/_next/static/'];
const STATIC_FILE_PATTERN = /\.(?:css|js|mjs|woff2?|ttf|otf|png|jpg|jpeg|gif|webp|svg|ico)$/i;
const OFFLINE_APP_ROUTES = new Set(['/dashboard', '/study/tasks', '/reading', '/review']);

function validStaticResponse(response, pathname) {
  if (!response?.ok) return false;
  const mime = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (/\.css$/i.test(pathname)) return mime === 'text/css';
  if (/\.(?:js|mjs)$/i.test(pathname)) return /^(?:application|text)\/(?:javascript|ecmascript)$/.test(mime ?? '');
  return true;
}

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
  if (event.data?.type === 'CLEAR_USER_CACHE') event.waitUntil(caches.delete(NAVIGATION_CACHE));
  if (event.data?.type === 'WARM_OFFLINE_ROUTES') event.waitUntil((async () => {
    const cache = await caches.open(NAVIGATION_CACHE);
    await Promise.all([...OFFLINE_APP_ROUTES].map(async (pathname) => {
      try {
        const response = await fetch(pathname, { credentials: 'include' });
        if (response.ok) await cache.put(new Request(`${self.location.origin}${pathname}`), response);
      } catch {}
    }));
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const routeKey = new Request(`${url.origin}${url.pathname}`);
      try {
        const response = await fetch(request);
        if (response.ok && OFFLINE_APP_ROUTES.has(url.pathname)) {
          try {
            const cache = await caches.open(NAVIGATION_CACHE);
            await cache.put(routeKey, response.clone());
          } catch {}
        }
        return response;
      } catch {
        const cache = await caches.open(NAVIGATION_CACHE);
        const cachedRoute = await cache.match(routeKey);
        if (cachedRoute) return cachedRoute;
        const cachedShell = await cache.match(new Request(`${url.origin}/dashboard`));
        if (cachedShell) return cachedShell;
        return (await caches.match(OFFLINE_URL)) ?? Response.error();
      }
    })());
    return;
  }

  const immutableNextAsset = STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
  const cacheableStaticAsset = immutableNextAsset || STATIC_FILE_PATTERN.test(url.pathname);
  if (!cacheableStaticAsset) return;

  event.respondWith((async () => {
    // Device storage can be unavailable or full; caching must not break delivery.
    let cached;
    try {
      cached = await caches.match(request);
      if (cached && !validStaticResponse(cached, url.pathname)) {
        cached = undefined;
        const cache = await caches.open(STATIC_CACHE);
        await cache.delete(request);
      }
    } catch {}
    if (immutableNextAsset && cached) return cached;

    try {
      const response = await fetch(request);
      if (validStaticResponse(response, url.pathname) && response.type === 'basic') {
        try {
          const cache = await caches.open(STATIC_CACHE);
          await cache.put(request, response.clone());
        } catch {}
      }
      if (!validStaticResponse(response, url.pathname) && cached) return cached;
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});
