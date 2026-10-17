const CACHE_PREFIX = 'jackyun-pwa';
const CACHE_VERSION = 'v8';
const STATIC_CACHE = `${CACHE_PREFIX}-static-${CACHE_VERSION}`;
const NAVIGATION_CACHE = `${CACHE_PREFIX}-pages-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/PracticeTimer.html', '/practice-engine.js', '/practice-audio.js',
  '/practice-cloud.js', '/practice-timer.js', '/practice-focus.css',
  '/practice-motion.css', '/practice-workspace.css',
  '/shared/site-dialog.js',
  '/shared/error-notices.js',
  '/docs/errors.html',
  '/Webicon.png',
  '/jackyun-icon-192.png',
  '/jackyun-logo.png',
];

const STATIC_PATH_PREFIXES = ['/_next/static/'];
const STATIC_FILE_PATTERN = /\.(?:css|js|mjs|woff2?|ttf|otf|png|jpg|jpeg|gif|webp|svg|ico)$/i;
const OFFLINE_APP_ROUTES = new Set(['/dashboard', '/study/tasks', '/reading', '/review', '/schedule', '/study', '/goal', '/study-guide', '/vocab', '/memory', '/time-management', '/tools', '/practice-timer', '/PracticeTimer.html', '/sleep', '/relax', '/help', '/update']);

function validStaticResponse(response, pathname) {
  if (!response?.ok) return false;
  const mime = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (/\.css$/i.test(pathname)) return mime === 'text/css';
  if (/\.(?:js|mjs)$/i.test(pathname)) return /^(?:application|text)\/(?:javascript|ecmascript)$/.test(mime ?? '');
  return true;
}

let cacheGeneration = 0;
const PAGE_TTL = 7 * 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 24;
async function fetchPage(request, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try { return await fetch(request, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
function validPage(response, pathname) {
  return response.ok && !response.redirected && new URL(response.url || `${self.location.origin}${pathname}`).pathname === pathname && response.headers.get('Content-Type')?.includes('text/html');
}
async function freshPage(cache, request) {
  const page = await cache.match(request);
  const saved = Number(page?.headers.get('X-JackYun-Cached-At'));
  if (!page || !saved || Date.now() - saved > PAGE_TTL) { if (page) await cache.delete(request); return undefined; }
  return page;
}
async function storePage(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set('X-JackYun-Cached-At', String(Date.now()));
  await cache.delete(request);
  await cache.put(request, new Response(await response.arrayBuffer(), { status: response.status, headers }));
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - PAGE_LIMIT)).map(key => cache.delete(key)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== NAVIGATION_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'BIND_USER_CACHE') event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const key = new Request(`${self.location.origin}/__offline_owner`);
    const previous = await cache.match(key);
    const owner = String(event.data.userId || 'guest');
    if (previous && await previous.text() !== owner) { cacheGeneration++; await caches.delete(NAVIGATION_CACHE); }
    await cache.put(key, new Response(owner));
  })());
  if (event.data?.type === 'WARM_VISITED_ROUTE') event.waitUntil((async () => {
    const url = new URL(event.data.url, self.location.origin);
    if (url.origin !== self.location.origin || !OFFLINE_APP_ROUTES.has(url.pathname)) return;
    const generation = cacheGeneration;
    try {
      const cache = await caches.open(NAVIGATION_CACHE);
      const key = new Request(url.href);
      const cached = await freshPage(cache, key);
      if (cached && Date.now() - Number(cached.headers.get('X-JackYun-Cached-At')) < 3600000) return;
      const response = await fetchPage(url.href, { credentials: 'include', headers: { Accept: 'text/html' } });
      if (validPage(response, url.pathname) && generation === cacheGeneration) await storePage(cache, key, response);
    } catch {}
  })());
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_USER_CACHE') event.waitUntil((cacheGeneration++, caches.delete(NAVIGATION_CACHE)).then(() => event.ports[0]?.postMessage({ cleared: true })));
  if (event.data?.type === 'GET_OFFLINE_STATUS') event.waitUntil((async () => {
    const cache = await caches.open(NAVIGATION_CACHE);
    const keys = await cache.keys();
    const routes = [];
    for (const key of keys) if (await freshPage(cache, key)) routes.push(new URL(key.url).pathname + new URL(key.url).search);
    event.ports[0]?.postMessage({ routes });
  })());
  if (event.data?.type === 'WARM_OFFLINE_ROUTES') event.waitUntil((async () => {
    const cache = await caches.open(NAVIGATION_CACHE);
    await Promise.all(['/dashboard', '/study/tasks', '/review'].map(async (pathname) => {
      try {
        const response = await fetch(pathname, { credentials: 'include' });
        if (validPage(response, pathname)) await storePage(cache, new Request(`${self.location.origin}${pathname}`), response);
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
      const generation = cacheGeneration;
      const routeKey = new Request(`${url.origin}${url.pathname}${url.search}`);
      try {
        const response = await fetchPage(request);
        if (validPage(response, url.pathname) && OFFLINE_APP_ROUTES.has(url.pathname) && generation === cacheGeneration) {
          try {
            const cache = await caches.open(NAVIGATION_CACHE);
            await storePage(cache, routeKey, response.clone());
          } catch {}
        }
        if (response.status >= 500) throw new Error('Server unavailable');
        return response;
      } catch {
        let cachedRoute;
        try { const cache = await caches.open(NAVIGATION_CACHE); cachedRoute = await freshPage(cache, routeKey); } catch {}
        // Only the requested page is a valid fallback.
        if (cachedRoute) return cachedRoute;
        if (url.pathname === '/PracticeTimer.html') { const timer = await caches.match('/PracticeTimer.html'); if (timer) return timer; }

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
