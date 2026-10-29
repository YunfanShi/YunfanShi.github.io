const CACHE_PREFIX = 'jackyun-pwa';
const CACHE_VERSION = 'v14';
const STATIC_CACHE = `${CACHE_PREFIX}-static-${CACHE_VERSION}`;
const PREVIOUS_STATIC_CACHE = `${CACHE_PREFIX}-static-v13`;
// Navigation entries survive worker updates; old immutable assets stay available for them.
const NAVIGATION_CACHE = `${CACHE_PREFIX}-pages-v10`;
const OWNER_CACHE = `${CACHE_PREFIX}-owner-v1`;
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
const OFFLINE_APP_ROUTES = new Set(["/dashboard", "/study/tasks", "/reading", "/review", "/schedule", "/study", "/goal", "/study-guide", "/vocab", "/memory", "/time-management", "/tools", "/practice-timer", "/sleep", "/relax", "/help", "/update", "/activity", "/ai", "/answer-sheet", "/answer-sheet-sync", "/bilibili-sync", "/countdown", "/definitions", "/examcountdown", "/igcountdown", "/ielts", "/ielts-writing", "/md2word", "/mock-portal", "/music", "/music-sync", "/poem", "/pomodoro", "/properties", "/quiz", "/resources", "/settings", "/settings/watch", "/studio", "/timetable-hub", "/userscripts", "/beta", "/control/focus", "/products", "/articles", "/AnswerSheet.html", "/AnswerSheetSync.html", "/BilibiliSync.html", "/Control.html", "/Countdown.html", "/EM.html", "/Goal.html", "/HelpCenter.html", "/IGCountdown.html", "/index.html", "/Jump.html", "/JumpMusic.html", "/MockPortal.html", "/MusicPlayer.html", "/MusicPlayerSync.html", "/Poem.html", "/Pomodoro.html", "/PracticeTimer.html", "/products.html", "/quiz.html", "/QuizWise.html", "/Relax.html", "/StudyGuide.html", "/Studyplan.html", "/Test.html", "/Time.html", "/TimetableHub.html", "/UpdateHub.html", "/Vocab.html"]);
function cacheablePage(pathname) { return !/^\/(?:api|admin|login|reset-password|update-password|oauth|unauthorized|account-status)(?:\/|$)/.test(pathname) && !pathname.startsWith("/__"); }

function validStaticResponse(response, pathname) {
  if (!response?.ok) return false;
  const mime = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (/\.css$/i.test(pathname)) return mime === 'text/css';
  if (/\.(?:js|mjs)$/i.test(pathname)) return /^(?:application|text)\/(?:javascript|ecmascript)$/.test(mime ?? '');
  return true;
}

let cacheGeneration = 0;
// Retain usable pages until explicit logout/account switch or bounded eviction.
let ownerBinding = Promise.resolve();
let warming = null;
const PAGE_LIMIT = 320;
async function fetchPage(request, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(request, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
async function fetchNavigation(request, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(request, options);
      if (response.status < 500 || attempt === 1) return response;
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
    }
  }
  throw lastError ?? new Error('Navigation request failed');
}
function validPage(response, pathname) {
  return response.ok && !response.redirected && new URL(response.url || `${self.location.origin}${pathname}`).pathname === pathname && response.headers.get('Content-Type')?.includes('text/html');
}
async function freshPage(cache, request) {
  const page = await cache.match(request);
  const saved = Number(page?.headers.get('X-JackYun-Cached-At'));
  if (!page || !saved) { if (page) await cache.delete(request); return undefined; }
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

async function cachePageAssets(response) {
  const html = await response.text();
  const urls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => {
    try { return new URL(match[1].replace(/&amp;/g, '&'), self.location.origin); } catch { return null; }
  }).filter(url => url && url.origin === self.location.origin && !url.pathname.startsWith('/api/') && STATIC_FILE_PATTERN.test(url.pathname));
  const cache = await caches.open(STATIC_CACHE);
  const queue = [...new Set(urls.map(url => url.href))].slice(0, 80);
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) { const url = queue.shift(); try {
      if (await cache.match(new Request(url))) continue;
      const asset = await fetchPage(url, {}, 20000);
      if (validStaticResponse(asset, new URL(url).pathname)) await cache.put(new Request(url), asset);
    } catch {} }
  }));
}
async function warmRoutes(urls) {
  await ownerBinding;
  const generation = cacheGeneration;
  const cache = await caches.open(NAVIGATION_CACHE);
  const queue = [...new Set(urls)];
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (queue.length && generation === cacheGeneration) {
      const url = new URL(queue.shift(), self.location.origin);
      if (url.origin !== self.location.origin || !cacheablePage(url.pathname)) continue;
      try {
        const key = new Request(url.href);
        const cached = await freshPage(cache, key);
        if (cached && Date.now() - Number(cached.headers.get('X-JackYun-Cached-At')) < 3600000) { await cachePageAssets(cached.clone()); continue; }
        const response = await fetchPage(url.href, { credentials: 'include', headers: { Accept: 'text/html' } }, 15000);
        if (validPage(response, url.pathname) && generation === cacheGeneration) {
          await cachePageAssets(response.clone());
          if (generation === cacheGeneration) await storePage(cache, key, response);
        }
      } catch {}
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => Promise.all(PRECACHE_URLS.map(async url => {
    try { const response = await fetchPage(url, {}, 10000); if (response.ok) await cache.put(new Request(new URL(url,self.location.origin).href),response); }
    catch { if (url === OFFLINE_URL) throw new Error('Offline shell unavailable'); }
  }))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE && key !== PREVIOUS_STATIC_CACHE && key !== NAVIGATION_CACHE && key !== OWNER_CACHE && key !== `${CACHE_PREFIX}-static-v10`).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'BIND_USER_CACHE') {
    ownerBinding = ownerBinding.then(async () => {
      const cache = await caches.open(OWNER_CACHE);
      const key = new Request(`${self.location.origin}/__offline_owner`);
      const previous = await cache.match(key) || await (await caches.open(`${CACHE_PREFIX}-static-v10`)).match(key);
      const owner = String(event.data.userId || 'guest');
      if (!previous || await previous.text() !== owner) { cacheGeneration++; await caches.delete(NAVIGATION_CACHE); }
      await cache.put(key, new Response(owner));
    }).catch(() => {});
    event.waitUntil(ownerBinding);
  }
  if (event.data?.type === 'WARM_VISITED_ROUTE' && typeof event.data.url === 'string') event.waitUntil(warmRoutes([event.data.url]));
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_USER_CACHE') event.waitUntil((cacheGeneration++, Promise.all([caches.delete(NAVIGATION_CACHE), caches.delete(OWNER_CACHE)])).then(() => event.ports[0]?.postMessage({ cleared: true })));
  if (event.data?.type === 'GET_OFFLINE_STATUS') event.waitUntil((async () => {
    const cache = await caches.open(NAVIGATION_CACHE);
    const keys = await cache.keys();
    const routes = [];
    for (const key of keys) if (await freshPage(cache, key)) routes.push(new URL(key.url).pathname + new URL(key.url).search);
    event.ports[0]?.postMessage({ routes });
  })());
  if (event.data?.type === 'WARM_OFFLINE_ROUTES') {
    const connection = self.navigator?.connection;
    if (!event.data.force && (connection?.saveData || ['slow-2g','2g'].includes(connection?.effectiveType))) return;
    if (!warming) warming = warmRoutes([...OFFLINE_APP_ROUTES]).finally(() => { warming = null; });
    event.waitUntil(warming);
  }

});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      await ownerBinding;
      const generation = cacheGeneration;
      const reopen = url.searchParams.has('_jackyun_reopen');
      url.searchParams.delete('_jackyun_reopen');
      const routeKey = new Request(`${url.origin}${url.pathname}${url.search}`);
      let cachedRoute;
      try { if (cacheablePage(url.pathname)) cachedRoute = await freshPage(await caches.open(NAVIGATION_CACHE), routeKey); } catch {}
      try {
        const response = await fetchNavigation(request, reopen ? {cache:'reload'} : {});
        if (validPage(response, url.pathname) && cacheablePage(url.pathname) && generation === cacheGeneration) {
          try {
            const cache = await caches.open(NAVIGATION_CACHE);
            await storePage(cache, routeKey, response.clone());
          } catch {}
        }
        if (response.status >= 500 && cachedRoute && cacheablePage(url.pathname)) return cachedRoute;
        return response;
      } catch {
        try { const cache = await caches.open(NAVIGATION_CACHE); cachedRoute = await freshPage(cache, routeKey); } catch {}
        // Only the requested page is a valid fallback; keep exact query semantics.
        if (cachedRoute && cacheablePage(url.pathname)) return cachedRoute;
        if (url.pathname === '/PracticeTimer.html') { const timer = await caches.match('/PracticeTimer.html'); if (timer) return timer; }

        try { const fallback = await caches.match(OFFLINE_URL); if (fallback) return fallback; } catch {}
        return new Response('<!doctype html><meta charset=utf-8><title>JackYun</title><p>此页面尚未保存，请联网打开一次。</p><a href=/PracticeTimer.html>打开练习计时器</a>', {status:200,headers:{'Content-Type':'text/html; charset=utf-8'}});
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
      const response = await fetchPage(request, {}, cached ? 2500 : 15000);
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
