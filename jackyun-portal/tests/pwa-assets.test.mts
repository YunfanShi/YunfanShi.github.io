import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function worker({ cached, response, quotaError = false }: { cached?: Response; response: Response; quotaError?: boolean }) {
  const listeners = new Map<string, (event: unknown) => void>();
  let writes = 0;
  let deletes = 0;
  runInNewContext(source, {
    URL, Request, Response,
    self: { location: { origin: 'https://example.com' }, addEventListener: (name: string, handler: (event: unknown) => void) => listeners.set(name, handler) },
    caches: {
      match: async () => cached,
      open: async () => ({
        put: async () => { writes++; if (quotaError) throw new Error('QuotaExceededError'); },
        delete: async () => { deletes++; cached = undefined; return true; },
      }),
    },
    fetch: async () => response,
  });
  return {
    async get(navigate = false) {
      let result: Promise<Response> | undefined;
      const request = navigate ? { method: 'GET', mode: 'navigate', url: 'https://example.com/dashboard' } : new Request('https://example.com/_next/static/css/app.css');
      listeners.get('fetch')!({ request, respondWith: (value: Promise<Response>) => { result = value; } });
      return result!;
    },
    writes: () => writes,
    deletes: () => deletes,
  };
}

function css() {
  const response = new Response('body{color:red}', { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
  Object.defineProperty(response, 'type', { value: 'basic' });
  return response;
}

test('a successful CSS download survives a full device cache', async () => {
  const sw = worker({ response: css(), quotaError: true });
  assert.equal(await (await sw.get()).text(), 'body{color:red}');
  assert.equal(sw.writes(), 1);
});

test('an online page still opens when its offline cache is full', async () => {
  const sw = worker({ response: new Response('<html>dashboard</html>'), quotaError: true });
  assert.equal(await (await sw.get(true)).text(), '<html>dashboard</html>');
});

test('a cached HTML response at a CSS URL is discarded and replaced', async () => {
  const sw = worker({ cached: new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }), response: css() });
  assert.equal(await (await sw.get()).text(), 'body{color:red}');
  assert.equal(sw.deletes(), 1);
  assert.equal(sw.writes(), 1);
});

test('an HTML network response cannot poison the CSS cache', async () => {
  const response = new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } });
  Object.defineProperty(response, 'type', { value: 'basic' });
  const sw = worker({ response });
  await sw.get();
  assert.equal(sw.writes(), 0);
});

test('a transient HTTP failure falls back to valid cached CSS', async () => {
  const sw = worker({ cached: css(), response: new Response('unavailable', { status: 503 }) });
  assert.equal(await (await sw.get()).text(), 'body{color:red}');
  assert.equal(sw.writes(), 0);
});
