import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
function harness() {
  const stores = new Map<string, Map<string, Response>>();
  const handlers = new Map<string, (event: unknown) => void>();
  let connected = true;
  let redirect = false;let status=200;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (key: string) => stores.delete(key),
    match: async () => new Response('offline fallback'),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const rows = stores.get(name)!;
      return { match: async (key: Request) => rows.get(key.url)?.clone(), put: async (key: Request, value: Response) => { rows.set(key.url, value.clone()); }, delete: async (key: Request) => rows.delete(key.url), keys: async () => [...rows.keys()].map(key => new Request(key)) };
    },
  };
  runInNewContext(source, { URL, Request, Response, Headers, AbortController, setTimeout, clearTimeout, caches,
    self: { location: { origin: 'https://example.com' }, clients: { claim: async () => {} }, addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler) },
    fetch: async (request: Request) => { if (!connected) throw new Error('offline'); const response = new Response(`page:${request.url}`, { status, headers: { 'Content-Type': 'text/html' } }); Object.defineProperty(response, 'redirected', { value: redirect }); return response; },
  });
  return { stores, status:(value:number)=>{status=value;}, connect: (value: boolean) => { connected = value; }, redirect: (value: boolean) => { redirect = value; },
    async navigate(path: string) { let result!: Promise<Response>; handlers.get('fetch')!({ request: { url: `https://example.com${path}`, method: 'GET', mode: 'navigate' }, respondWith: (value: Promise<Response>) => { result = value; } }); return (await result).text(); },
    async message(data: unknown) { let promise!: Promise<unknown>; handlers.get('message')!({ data, ports: [], waitUntil: (value: Promise<unknown>) => { promise = value; } }); await promise; },
    async activate() { let promise!: Promise<unknown>; handlers.get('activate')!({ waitUntil: (value: Promise<unknown>) => { promise = value; } }); await promise; },
  };
}
test('offline navigation retains exact pathname and query and never substitutes dashboard', async () => {
  const sw = harness(); await sw.navigate('/dashboard'); await sw.navigate('/schedule?view=week'); sw.connect(false);
  assert.equal(await sw.navigate('/schedule?view=week'), 'page:https://example.com/schedule?view=week');
  assert.equal(await sw.navigate('/schedule?view=month'), 'offline fallback');
  assert.equal(await sw.navigate('/activity'), 'offline fallback');
});
test('expired pages and redirected sign-in responses are never served as offline app pages', async () => {
  const sw = harness(); await sw.navigate('/schedule');
  const pages = sw.stores.get('jackyun-pwa-pages-v8')!;
  pages.set('https://example.com/schedule', new Response('expired', { headers: { 'X-JackYun-Cached-At': String(Date.now() - 8 * 86400000) } }));
  sw.connect(false); assert.equal(await sw.navigate('/schedule'), 'offline fallback');
  sw.connect(true); sw.redirect(true); await sw.navigate('/study'); sw.connect(false);
  assert.equal(await sw.navigate('/study'), 'offline fallback');
});
test('activation keeps current caches and account changes clear personal pages', async () => {
  const sw = harness(); await sw.navigate('/schedule'); sw.stores.set('jackyun-pwa-static-v4', new Map());
  await sw.activate(); assert.ok(sw.stores.has('jackyun-pwa-pages-v8')); assert.ok(!sw.stores.has('jackyun-pwa-static-v4'));
  await sw.message({ type: 'BIND_USER_CACHE', userId: 'first' });
  await sw.message({ type: 'BIND_USER_CACHE', userId: 'second' });
  assert.ok(!sw.stores.has('jackyun-pwa-pages-v8'));
});
test('offline page storage stays bounded while preserving the newest pages', async () => {
  const sw = harness(); for (let index = 0; index < 30; index++) await sw.navigate(`/schedule?day=${index}`);
  const pages = sw.stores.get('jackyun-pwa-pages-v8')!;
  assert.equal(pages.size, 24); assert.ok(pages.has('https://example.com/schedule?day=29')); assert.ok(!pages.has('https://example.com/schedule?day=0'));
});

 test('Practice Timer shell and iframe both survive offline navigation', async () => {
 const sw=harness();await sw.navigate('/practice-timer');await sw.navigate('/PracticeTimer.html');sw.connect(false);
 assert.equal(await sw.navigate('/practice-timer'),'page:https://example.com/practice-timer');
 assert.equal(await sw.navigate('/PracticeTimer.html'),'page:https://example.com/PracticeTimer.html');
 });

test('server failures fall back to the cached timer without replacing it with an error page',async()=>{
 const sw=harness();await sw.navigate('/practice-timer');sw.status(503);
 assert.equal(await sw.navigate('/practice-timer'),'page:https://example.com/practice-timer');
});
