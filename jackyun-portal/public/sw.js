const CACHE_PREFIX = 'jackyun-pwa';
const SHELL_CACHE = `${CACHE_PREFIX}-shell-v1`;
// Keep runtime assets across worker updates so saved HTML can still load its chunks.
const STATIC_CACHE = `${CACHE_PREFIX}-static-v14`;
const PREVIOUS_STATIC_CACHE = `${CACHE_PREFIX}-static-v13`;
// Navigation entries survive worker updates; old immutable assets stay available for them.
const NAVIGATION_CACHE = `${CACHE_PREFIX}-pages-v10`;
const OWNER_CACHE = `${CACHE_PREFIX}-owner-v1`;
const OFFLINE_URL = '/offline.html';

const BRAND_ASSETS = ['/Webicon.png', '/jackyun-icon-192.png', '/jackyun-logo.png', '/fonts/material-icons-round.woff2'];
const SHELL_ASSETS = new Set([...BRAND_ASSETS, '/shared/error-notices.js', '/shared/site-dialog.js']);
const STARTUP_ROUTES = ['/dashboard', '/schedule', '/study/tasks'];
const CACHE_FIRST_ROUTES = new Set([
  ...STARTUP_ROUTES, '/study', '/goal', '/study-guide', '/vocab', '/memory', '/review',
  '/time-management', '/practice-timer', '/PracticeTimer.html', '/tools', '/pomodoro', '/sleep',
]);
const TIMER_URL = '/PracticeTimer.html';
const TIMER_ASSETS = [
  TIMER_URL, '/practice-engine.js', '/practice-audio.js',
  '/practice-cloud.js', '/practice-timer.js', '/practice-focus.css',
  '/practice-motion.css', '/practice-workspace.css',
  '/shared/site-dialog.js',
  '/shared/error-notices.js',
  '/docs/errors.html',
];

const STATIC_PATH_PREFIXES = ['/_next/static/'];
const STATIC_FILE_PATTERN = /\.(?:css|js|mjs|woff2?|ttf|otf|png|jpg|jpeg|gif|webp|svg|ico)$/i;
const OFFLINE_APP_ROUTES = new Set(["/dashboard", "/study/tasks", "/reading", "/review", "/schedule", "/study", "/goal", "/study-guide", "/vocab", "/memory", "/time-management", "/tools", "/PracticeTimer.html", "/practice-timer", "/sleep", "/relax", "/help", "/update", "/activity", "/ai", "/answer-sheet", "/answer-sheet-sync", "/bilibili-sync", "/countdown", "/definitions", "/examcountdown", "/igcountdown", "/ielts", "/ielts-writing", "/md2word", "/mock-portal", "/music", "/music-sync", "/poem", "/pomodoro", "/properties", "/quiz", "/resources", "/settings", "/settings/watch", "/studio", "/timetable-hub", "/userscripts", "/beta", "/control/focus", "/products", "/articles", "/AnswerSheet.html", "/AnswerSheetSync.html", "/BilibiliSync.html", "/Control.html", "/Countdown.html", "/EM.html", "/Goal.html", "/HelpCenter.html", "/IGCountdown.html", "/index.html", "/Jump.html", "/JumpMusic.html", "/MockPortal.html", "/MusicPlayer.html", "/MusicPlayerSync.html", "/Poem.html", "/Pomodoro.html", "/products.html", "/quiz.html", "/QuizWise.html", "/Relax.html", "/StudyGuide.html", "/Studyplan.html", "/Test.html", "/Time.html", "/TimetableHub.html", "/UpdateHub.html", "/Vocab.html"]);
function cacheablePage(pathname) { return !/^\/(?:api|admin|auth|login|reset-password|update-password|oauth|unauthorized|account-status)(?:\/|$)/.test(pathname) && !pathname.startsWith("/__"); }

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
const pageRefreshes = new Map();
const assetRefreshes = new Map();
const PAGE_LIMIT = 320;
const NAVIGATION_TIMEOUT = 4000;
const PAGE_FAST_WINDOW = 5 * 60_000;
const PAGE_REFRESH_INTERVAL = 60_000;
const WARM_PAGE_WINDOW = 60 * 60_000;
async function fetchPage(request, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(request, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
function pageKey(url) {
  // Strip only the internal refresh marker, preserving application query parameters.
  if (!url.searchParams.has('_jackyun_reopen')) return new Request(`${url.origin}${url.pathname}${url.search}`);
  const query = url.search.slice(1).split('&').filter(part => !new URLSearchParams(part).has('_jackyun_reopen')).join('&');
  return new Request(`${url.origin}${url.pathname}${query ? `?${query}` : ''}`);
}
function validPage(response, pathname) {
  return response.ok && !response.redirected && new URL(response.url || `${self.location.origin}${pathname}`).pathname === pathname && response.headers.get('Content-Type')?.includes('text/html');
}
async function savedPage(cache, request) {
  const page = await cache.match(request);
  const saved = Number(page?.headers.get('X-JackYun-Cached-At'));
  if (!page || !saved) { if (page) await cache.delete(request); return undefined; }
  return page;
}
async function storePage(cache, request, response, generation) {
  const headers = new Headers(response.headers);
  const body = await response.arrayBuffer();
  if (!await cachePageAssets(new TextDecoder().decode(body), request.url) || generation !== cacheGeneration) return;
  headers.set('X-JackYun-Cached-At', String(Date.now()));
  // Fetch has already decoded the body. Replacing the entry must be atomic.
  headers.delete('Content-Encoding');
  headers.delete('Content-Length');
  await cache.put(request, new Response(body, { status: response.status, headers }));
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - PAGE_LIMIT)).map(key => cache.delete(key)));
}

async function cachePageAssets(html, pageUrl) {
  const urls = new Map();
  for (const [, tag, attributes] of html.matchAll(/<(script|link)\b([^>]+)>/gi)) {
    const [, source] = attributes.match(/\b(?:src|href)=["']([^"']+)["']/i) ?? [];
    if (!source) continue;
    try {
      const url = new URL(source.replace(/&amp;/g, '&'), pageUrl);
      if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || !STATIC_FILE_PATTERN.test(url.pathname)) continue;
      url.hash = '';
      const required = tag.toLowerCase() === 'script' || /\brel=["']stylesheet["']/i.test(attributes) || /\.(?:js|mjs)$/i.test(url.pathname);
      urls.set(url.href, required || urls.get(url.href) === true);
    } catch {}
  }
  const queue = [...urls].filter(([, required]) => required);
  queue.push(...[...urls].filter(([, required]) => !required).slice(0, 16));
  if (!queue.length) return true;

  const cache = await caches.open(STATIC_CACHE);
  let ready = true;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const [href, required] = queue.shift();
      const { pathname } = new URL(href);
      try {
        const assetKey = new Request(href);
        if (validStaticResponse(await caches.match(assetKey), pathname)) continue;
        const asset = await fetchPage(assetKey, {}, 10000);
        if (!validStaticResponse(asset, pathname)) throw new Error('Offline asset unavailable');
        await cache.put(assetKey, asset);
      } catch {
        if (required) ready = false;
      }
    }
  }));
  return ready;
}
function pageAge(page) {
  return Date.now() - Number(page.headers.get('X-JackYun-Cached-At'));
}

function refreshPage(cache, key, generation) {
  const pending = pageRefreshes.get(key.url);
  if (pending?.generation === generation) return pending.task;
  const task = (async () => {
    try {
      const response = await fetchPage(key, { redirect: 'manual', headers: { Accept: 'text/html' } }, NAVIGATION_TIMEOUT);
      if (generation !== cacheGeneration) return;
      if (validPage(response, new URL(key.url).pathname)) {
        await storePage(cache, key, response, generation);
      } else if (response.redirected || response.type === 'opaqueredirect' || [401, 403, 404, 410].includes(response.status)) {
        await cache.delete(key);
      }
    } catch {}
  })().finally(() => {
    if (pageRefreshes.get(key.url)?.task === task) pageRefreshes.delete(key.url);
  });
  pageRefreshes.set(key.url, { generation, task });
  return task;
}

async function warmRoutes(urls) {
  try {
    await ownerBinding;
    const generation = cacheGeneration;
    const cache = await caches.open(NAVIGATION_CACHE);
    const queue = [...new Set(urls)];
    await Promise.all(Array.from({ length: 2 }, async () => {
      while (queue.length && generation === cacheGeneration) {
        try {
          const url = new URL(queue.shift(), self.location.origin);
          if (url.origin !== self.location.origin || !cacheableNavigation(url.pathname)) continue;
          const key = pageKey(url);
          const cached = await savedPage(cache, key);
          if (!cached || pageAge(cached) >= WARM_PAGE_WINDOW) await refreshPage(cache, key, generation);
        } catch {}
      }
    }));
  } catch {}
}

async function saveShellAsset(cache, path) {
  const key = new Request(new URL(path, self.location.origin));
  const response = await fetchPage(key, { cache: 'reload' }, 10000);
  const valid = path.endsWith('.html') ? validPage(response, path) : validStaticResponse(response, path);
  if (!valid) throw new Error(`Offline shell asset unavailable: ${path}`);
  await cache.put(key, response);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await saveShellAsset(shell, OFFLINE_URL);
    // Write the timer document only after its dependencies are available.
    const timer = Promise.all(TIMER_ASSETS.slice(1).map(path => saveShellAsset(shell, path)))
      .then(() => saveShellAsset(shell, TIMER_URL));
    await Promise.allSettled([timer, ...BRAND_ASSETS.map(path => saveShellAsset(shell, path))]);
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== STATIC_CACHE && key !== PREVIOUS_STATIC_CACHE && key !== NAVIGATION_CACHE && key !== OWNER_CACHE && key !== `${CACHE_PREFIX}-static-v10`).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function clearUserCache() {
  ownerBinding = ownerBinding.then(async () => {
    cacheGeneration++;
    await Promise.all([caches.delete(NAVIGATION_CACHE), caches.delete(OWNER_CACHE)]);
  }).catch(() => {});
  return ownerBinding;
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'BIND_USER_CACHE') {
    ownerBinding = ownerBinding.then(async () => {
      const cache = await caches.open(OWNER_CACHE);
      const key = new Request(`${self.location.origin}/__offline_owner`);
      const bound = await cache.match(key);
      const previous = bound ?? await (await caches.open(`${CACHE_PREFIX}-static-v10`)).match(key);
      const owner = String(event.data.userId || 'guest');
      if (!previous || await previous.text() !== owner) {
        cacheGeneration++;
        await caches.delete(NAVIGATION_CACHE);
      } else if (bound) return;
      await cache.put(key, new Response(owner));
    }).catch(() => {});
    event.waitUntil(ownerBinding);
  }
  if (event.data?.type === 'WARM_VISITED_ROUTE' && typeof event.data.url === 'string') event.waitUntil(warmRoutes([event.data.url]));
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_USER_CACHE') event.waitUntil(clearUserCache().then(() => event.ports[0]?.postMessage({ cleared: true })));
  if (event.data?.type === 'GET_OFFLINE_STATUS') event.waitUntil((async () => {
    try {
      await ownerBinding;
      const generation = cacheGeneration;
      const cache = await caches.open(NAVIGATION_CACHE);
      const keys = await cache.keys();
      const shell = await caches.open(SHELL_CACHE);
      const hasTimer = await shell.match(TIMER_URL) || await savedPage(cache, new Request(`${self.location.origin}${TIMER_URL}`));
      const routes = [];
      for (const key of keys) {
        const url = new URL(key.url);
        // The standalone timer depends on its parent workspace to start and save sessions.
        if (url.pathname === TIMER_URL || (url.pathname === '/practice-timer' && !hasTimer)) continue;
        if (cacheableNavigation(url.pathname) && await savedPage(cache, key)) routes.push(url.pathname + url.search);
      }
      event.ports[0]?.postMessage({ routes: generation === cacheGeneration ? routes : [] });
    } catch {
      event.ports[0]?.postMessage({ unavailable: true });
    }
  })());
  if (event.data?.type === 'WARM_OFFLINE_ROUTES') {
    if (self.navigator?.onLine === false) return;
    const connection = self.navigator?.connection;
    if (!event.data.force && (connection?.saveData || ['slow-2g','2g'].includes(connection?.effectiveType))) return;
    if (!event.data.force) {
      event.waitUntil(warmRoutes(STARTUP_ROUTES));
    } else {
      if (!warming) warming = warmRoutes(OFFLINE_APP_ROUTES).finally(() => { warming = null; });
      event.waitUntil(warming);
    }
  }
});

function cacheableNavigation(path) {
  return path !== OFFLINE_URL && path !== '/' && cacheablePage(path);
}

async function savedNavigation(path, cachedRoute) {
  if (cachedRoute) return cachedRoute;
  try {
    const shell = await caches.open(SHELL_CACHE);
    if (path === TIMER_URL) {
      const timer = await shell.match(TIMER_URL);
      if (timer) return timer;
    }
    if (path === '/') {
      const pages = await caches.open(NAVIGATION_CACHE);
      if (await savedPage(pages, new Request(`${self.location.origin}/dashboard`))) {
        return Response.redirect(`${self.location.origin}/dashboard`);
      }
    }
    const fallback = await shell.match(OFFLINE_URL);
    if (fallback) return fallback;
  } catch {}
  return new Response('<!doctype html><html lang="zh-CN"><meta charset=utf-8><title>JackYun 离线页面</title><h1>暂时无法打开此页面</h1><p>请恢复连接后重试。</p></html>', {
    status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

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
      const reload = reopen || ['reload', 'no-cache', 'no-store'].includes(request.cache);
      const routeKey = pageKey(url);
      if (!reload && url.pathname === '/' && !url.search) {
        try {
          const pages = await caches.open(NAVIGATION_CACHE);
          const dashboard = await savedPage(pages, new Request(`${url.origin}/dashboard`));
          if (dashboard && pageAge(dashboard) < PAGE_FAST_WINDOW && generation === cacheGeneration) {
            return Response.redirect(`${url.origin}/dashboard`);
          }
        } catch {}
      }
      let cache;
      let cachedRoute;
      if (cacheableNavigation(url.pathname)) {
        try {
          cache = await caches.open(NAVIGATION_CACHE);
          cachedRoute = await savedPage(cache, routeKey);
        } catch {}
      }
      if (!reload && cachedRoute && CACHE_FIRST_ROUTES.has(url.pathname) && pageAge(cachedRoute) < PAGE_FAST_WINDOW && generation === cacheGeneration) {
        if (self.navigator?.onLine !== false && pageAge(cachedRoute) >= PAGE_REFRESH_INTERVAL) {
          event.waitUntil(refreshPage(cache, routeKey, generation));
        }
        return cachedRoute;
      }
      try {
        const response = await fetchPage(request, reopen ? { cache: 'reload' } : {}, NAVIGATION_TIMEOUT);
        // Redirects and client errors still go through the server's normal flows.
        if (response.status < 500) {
          // The OAuth callback can change accounts before the next page binds its owner.
          if (url.pathname === '/auth/callback' && url.searchParams.has('code') && response.type === 'opaqueredirect') {
            await clearUserCache();
          }
          if (cache && generation === cacheGeneration && validPage(response, url.pathname)) {
            const saving = reopen ? refreshPage(cache, routeKey, generation) : storePage(cache, routeKey, response.clone(), generation).catch(() => {});
            event.waitUntil(saving);
          } else if (cache && cachedRoute && generation === cacheGeneration && (response.type === 'opaqueredirect' || [401, 403, 404, 410].includes(response.status))) {
            event.waitUntil(cache.delete(routeKey).catch(() => {}));
          }
          return response;
        }
      } catch {}
      return savedNavigation(url.pathname, generation === cacheGeneration ? cachedRoute : undefined);
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
    if (!cached && TIMER_ASSETS.includes(url.pathname)) {
      try {
        const bundled = await (await caches.open(SHELL_CACHE)).match(request);
        if (validStaticResponse(bundled, url.pathname)) cached = bundled;
      } catch {}
    }

    const loadAsset = () => fetchPage(request, {}, cached ? 2500 : 15000);
    const saveAsset = async response => {
      if (validStaticResponse(response, url.pathname) && response.type === 'basic') {
        try {
          const cache = await caches.open(STATIC_CACHE);
          await cache.put(request, response.clone());
        } catch {}
      }
    };

    const reload = ['reload', 'no-cache', 'no-store'].includes(request.cache);
    if (cached && SHELL_ASSETS.has(url.pathname) && !reload) {
      const savedAt = Date.parse(cached.headers.get('Date') ?? '');
      if (self.navigator?.onLine !== false && !(Date.now() - savedAt < PAGE_FAST_WINDOW)) {
        let pending = assetRefreshes.get(request.url);
        if (!pending) {
          pending = loadAsset().then(saveAsset, () => {}).finally(() => assetRefreshes.delete(request.url));
          assetRefreshes.set(request.url, pending);
        }
        event.waitUntil(pending);
      }
      return cached;
    }
    try {
      const response = await loadAsset();
      if (validStaticResponse(response, url.pathname)) {
        event.waitUntil(saveAsset(response));
        return response;
      }
      return cached || response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});
