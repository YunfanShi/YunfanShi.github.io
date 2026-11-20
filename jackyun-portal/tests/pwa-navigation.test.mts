import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
function harness() {
  const stores = new Map<string, Map<string, Response>>();
  const handlers = new Map<string, (event: unknown) => void>();
  let connected = true;
  let redirect = false;
  let status = 200;
  const responses = new Map<string, () => Response | Promise<Response>>();
  const requested: string[] = [];
  let lastWork: Promise<unknown>[] = [];
  let stalledUrl: string | undefined;
  const href = (key: string | Request) => typeof key === 'string' ? new URL(key, 'https://example.com').href : key.url;
  stores.set('jackyun-pwa-shell-v1', new Map([['https://example.com/offline.html', new Response('offline fallback')]]));
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (key: string) => stores.delete(key),
    match: async (key: Request) => [...stores.values()].find(rows => rows.has(href(key)))?.get(href(key))?.clone(),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const rows = stores.get(name)!;
      return { match: async (key: string | Request) => rows.get(href(key))?.clone(), put: async (key: Request, value: Response) => { rows.delete(key.url); rows.set(key.url, value.clone()); }, delete: async (key: Request) => rows.delete(key.url), keys: async () => [...rows.keys()].map(key => new Request(key)) };
    },
  };
  runInNewContext(source, { URL, URLSearchParams, TextDecoder, Request, Response, Headers, AbortController, clearTimeout, caches,
    setTimeout: (callback: () => void, ms: number) => setTimeout(callback, stalledUrl ? 10 : ms),
    self: { location: { origin: 'https://example.com' }, clients: { claim: async () => {} }, addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler) },
    fetch: async (request: string | Request, options: RequestInit) => {
      const url = href(request);
      requested.push(url);
      if (!connected) throw new Error('offline');
      if (url === stalledUrl) {
        return new Promise<Response>((_, reject) => {
          options.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
        });
      }
      const response = (await responses.get(url)?.()) ?? new Response(`page:${url}`, { status, headers: { 'Content-Type': 'text/html' } });
      Object.defineProperty(response, 'redirected', { value: redirect });
      return response;
    },
  });
  return {
    stores,
    requested,
    status: (value: number) => { status = value; },
    connect: (value: boolean) => { connected = value; },
    redirect: (value: boolean) => { redirect = value; },
    respond: (path: string, response: () => Response | Promise<Response>) => responses.set(href(path), response),
    stall: (path: string) => { stalledUrl = href(path); },
    agePage(path: string, minutes: number) {
      const page = stores.get('jackyun-pwa-pages-v10')?.get(href(path));
      page?.headers.set('X-JackYun-Cached-At', String(Date.now() - minutes * 60_000));
    },
    async document(path: string, { cache = 'default', waitForWork = true } = {}) {
      let result!: Promise<Response>;
      const work: Promise<unknown>[] = [];
      lastWork = work;
      handlers.get('fetch')!({
        request: { url: href(path), method: 'GET', mode: 'navigate', cache },
        respondWith: (value: Promise<Response>) => { result = value; },
        waitUntil: (value: Promise<unknown>) => { work.push(value); },
      });
      const response = await result;
      if (waitForWork) await Promise.all(work);
      return response;
    },
    async finishBackgroundWork() { await Promise.all(lastWork); },
    async navigate(path: string) { return (await this.document(path)).text(); },
    async message(data: unknown) {
      let promise!: Promise<unknown>;
      let reply: unknown;
      handlers.get('message')!({
        data,
        ports: [{ postMessage: (value: unknown) => { reply = structuredClone(value); } }],
        waitUntil: (value: Promise<unknown>) => { promise = value; },
      });
      await promise;
      return reply;
    },
    async activate() { let promise!: Promise<unknown>; handlers.get('activate')!({ waitUntil: (value: Promise<unknown>) => { promise = value; } }); await promise; },
  };
}
test('offline navigation retains exact pathname and query and never substitutes dashboard', async () => {
  const sw = harness(); await sw.navigate('/dashboard'); await sw.navigate('/schedule?view=week'); sw.connect(false);
  assert.equal(await sw.navigate('/schedule?view=week'), 'page:https://example.com/schedule?view=week');
  assert.equal(await sw.navigate('/schedule?view=month'), 'offline fallback');
  assert.equal(await sw.navigate('/activity'), 'offline fallback');
});
test('old usable pages remain available and redirected sign-in responses are never cached', async () => {
  const sw = harness(); await sw.navigate('/schedule');
  const pages = sw.stores.get('jackyun-pwa-pages-v10')!;
  pages.set('https://example.com/schedule', new Response('expired', { headers: { 'X-JackYun-Cached-At': String(Date.now() - 8 * 86400000) } }));
  sw.connect(false); assert.equal(await sw.navigate('/schedule'), 'expired');
  sw.connect(true); sw.redirect(true); await sw.navigate('/study'); sw.connect(false);
  assert.equal(await sw.navigate('/study'), 'offline fallback');
});
test('activation keeps current caches and account changes clear personal pages', async () => {
  const sw = harness(); await sw.navigate('/schedule'); sw.stores.set('jackyun-pwa-static-v4', new Map());
  await sw.activate(); assert.ok(sw.stores.has('jackyun-pwa-pages-v10')); assert.ok(!sw.stores.has('jackyun-pwa-static-v4'));
  await sw.message({ type: 'BIND_USER_CACHE', userId: 'first' });
  await sw.message({ type: 'BIND_USER_CACHE', userId: 'second' });
  assert.ok(!sw.stores.has('jackyun-pwa-pages-v10'));
});
test('offline page storage stays bounded while preserving the newest pages', async () => {
  const sw = harness(); for (let index = 0; index < 330; index++) await sw.navigate(`/schedule?day=${index}`);
  const pages = sw.stores.get('jackyun-pwa-pages-v10')!;
  assert.equal(pages.size, 320); assert.ok(pages.has('https://example.com/schedule?day=329')); assert.ok(!pages.has('https://example.com/schedule?day=0'));
});

 test('the offline list links to the Practice Timer workspace once its iframe is ready', async () => {
  const sw = harness();
  await sw.navigate('/practice-timer');
  assert.deepEqual(await sw.message({ type: 'GET_OFFLINE_STATUS' }), { routes: [] });
  await sw.navigate('/PracticeTimer.html');
  sw.connect(false);
  assert.deepEqual(await sw.message({ type: 'GET_OFFLINE_STATUS' }), { routes: ['/practice-timer'] });
  assert.equal(await sw.navigate('/practice-timer'), 'page:https://example.com/practice-timer');
  assert.equal(await sw.navigate('/PracticeTimer.html'), 'page:https://example.com/PracticeTimer.html');
});

test('server failures fall back to the cached timer without replacing it with an error page',async()=>{
 const sw=harness();await sw.navigate('/practice-timer');sw.status(503);
 assert.equal(await sw.navigate('/practice-timer'),'page:https://example.com/practice-timer');
});

test('every portal module can retain its own offline document including query variants',async()=>{
 const sw=harness();
 for(const route of ['/ai','/settings?section=watch','/ielts-writing','/activity','/music','/articles/example'])await sw.navigate(route);
 sw.connect(false);
 for(const route of ['/ai','/settings?section=watch','/ielts-writing','/activity','/music','/articles/example'])assert.equal(await sw.navigate(route),'page:https://example.com'+route);
});
test('administrator and credential pages never become personal offline documents',async()=>{
 const sw=harness();await sw.navigate('/admin/users');await sw.navigate('/login');sw.connect(false);
 assert.equal(await sw.navigate('/admin/users'),'offline fallback');assert.equal(await sw.navigate('/login'),'offline fallback');
});
test('owner survives worker update and blocks account mixing',async()=>{
 const sw=harness();await sw.message({type:'BIND_USER_CACHE',userId:'one'});await sw.navigate('/ai');await sw.activate();
 await sw.message({type:'BIND_USER_CACHE',userId:'two'});sw.connect(false);assert.equal(await sw.navigate('/ai'),'offline fallback');
});

test('a server outage opens the offline library for an uncached page and routes the homepage to the saved dashboard', async () => {
  const sw = harness();
  await sw.navigate('/dashboard');
  await sw.navigate('/schedule?date=Nov%2020');
  sw.status(503);
  assert.equal(await sw.navigate('/unvisited'), 'offline fallback');
  const home = await sw.document('/');
  assert.equal(home.headers.get('Location'), 'https://example.com/dashboard');
  assert.deepEqual(await sw.message({ type: 'GET_OFFLINE_STATUS' }), {
    routes: ['/dashboard', '/schedule?date=Nov%2020'],
  });
  assert.equal(await sw.navigate('/schedule?date=Nov%2020'), 'page:https://example.com/schedule?date=Nov%2020');
});

test('a page enters the offline library only after its script is cached', async () => {
  const sw = harness();
  sw.respond('/articles/example', () => new Response('<script src="./article.js"></script>', { headers: { 'Content-Type': 'text/html' } }));
  await sw.navigate('/articles/example');
  assert.equal(await sw.navigate('/articles/example'), '<script src="./article.js"></script>');
  assert.deepEqual(await sw.message({ type: 'GET_OFFLINE_STATUS' }), { routes: [] });
  sw.respond('/articles/article.js', () => new Response('void 0', { headers: { 'Content-Type': 'text/javascript' } }));
  await sw.navigate('/articles/example');
  sw.connect(false);
  assert.equal(await sw.navigate('/articles/example'), '<script src="./article.js"></script>');
  assert.deepEqual(await sw.message({ type: 'GET_OFFLINE_STATUS' }), { routes: ['/articles/example'] });
});

test('a stalled document request is aborted and opens the saved document', { timeout: 1000 }, async () => {
  const sw = harness();
  await sw.navigate('/dashboard');
  sw.agePage('/dashboard', 6);
  sw.stall('/dashboard');
  assert.equal(await sw.navigate('/dashboard'), 'page:https://example.com/dashboard');
  assert.equal(sw.requested.length, 2);
});

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
}

test('recent local-first pages and the homepage open without an origin request', async () => {
  const sw = harness();
  await sw.navigate('/dashboard');
  sw.stall('/dashboard');
  assert.equal((await sw.document('/')).headers.get('Location'), 'https://example.com/dashboard');
  assert.equal(await sw.navigate('/dashboard'), 'page:https://example.com/dashboard');
  assert.deepEqual(sw.requested, ['https://example.com/dashboard']);
});

test('background refreshes share one fetch and keep a response ready during the request', async () => {
  const sw = harness();
  await sw.navigate('/schedule');
  sw.agePage('/schedule', 2);
  const origin = Promise.withResolvers<Response>();
  sw.respond('/schedule', () => origin.promise);
  const first = await sw.document('/schedule', { waitForWork: false });
  const second = await sw.document('/schedule', { waitForWork: false });
  assert.equal(await first.text(), 'page:https://example.com/schedule');
  assert.equal(await second.text(), 'page:https://example.com/schedule');
  assert.equal(sw.requested.length, 2);
  origin.resolve(html('updated'));
  await sw.finishBackgroundWork();
  assert.equal(await sw.navigate('/schedule'), 'updated');
});

test('explicit reloads and protected content check the network before using a saved document', async () => {
  const sw = harness();
  await sw.navigate('/schedule');
  sw.respond('/schedule', () => html('updated'));
  assert.equal(await (await sw.document('/schedule', { cache: 'no-cache' })).text(), 'updated');
  await sw.navigate('/reading');
  sw.respond('/reading', () => html('restricted', 403));
  assert.equal((await sw.document('/reading')).status, 403);
  sw.connect(false);
  assert.equal(await sw.navigate('/reading'), 'offline fallback');
});

test('OAuth callback redirects clear saved documents before entering the next account', async () => {
  const sw = harness();
  await sw.message({ type: 'BIND_USER_CACHE', userId: 'previous' });
  await sw.navigate('/dashboard');
  sw.respond('/auth/callback?code=example', () => {
    const response = Response.redirect('https://example.com/dashboard');
    Object.defineProperty(response, 'type', { value: 'opaqueredirect' });
    return response;
  });
  assert.equal((await sw.document('/auth/callback?code=example')).type, 'opaqueredirect');
  sw.respond('/dashboard', () => html('new account'));
  assert.equal(await sw.navigate('/dashboard'), 'new account');
});

test('automatic preparation is limited to the main starting pages', async () => {
  const sw = harness();
  await sw.message({ type: 'WARM_OFFLINE_ROUTES' });
  assert.deepEqual(new Set(sw.requested), new Set(['/dashboard', '/schedule', '/study/tasks'].map(path => 'https://example.com' + path)));
});
