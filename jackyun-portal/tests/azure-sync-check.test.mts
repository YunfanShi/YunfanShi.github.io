import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { randomUUID } from 'node:crypto';

function harness({ expiry = Date.now() + 60000, role = 'admin', active = true } = {}) {
  const exports: Record<string, (request?: Request) => Promise<Response>> = {};
  let calls = 0, authCalls = 0;
  const supabase = { auth: {
    getUser: async () => { authCalls++; return { data: { user: { id: 'alice' } } }; },
    getSession: async () => ({ data: { session: { access_token: 'private-test-token' } } }),
  }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
    data: { role, account_status: active ? 'active' : 'suspended', deleted_at: null },
  }) }) }) }) };
  const code = ts.transpileModule(readFileSync(new URL('../src/app/api/admin/azure-sync-check/route.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { exports, Response, URL, Date, AbortSignal, process: { env: { AZURE_SYNC_CHECK_EXPIRES: String(expiry) } },
    require: (name: string) => name === 'node:crypto' ? { randomUUID } : name.includes('admin-auth')
      ? { isAdminIdentity: (_user: unknown, candidate: string) => candidate === 'admin' } : { createClient: async () => supabase },
    fetch: async () => { calls++; throw Error('Upstream private error private-test-token'); },
  });
  return { route: exports, counts: () => ({ calls, authCalls }) };
}

test('verification is closed by default/expired and does not authenticate or call Azure', async () => {
  for (const expiry of [0, Date.now() - 1, Date.now() + 5 * 3600000]) {
    const h = harness({ expiry });
    assert.equal((await h.route.GET()).status, 404);
    assert.deepEqual(h.counts(), { calls: 0, authCalls: 0 });
  }
});

test('fresh suspended and non-admin accounts cannot execute verification', async () => {
  for (const options of [{ role: 'user' }, { active: false }]) {
    const h = harness(options);
    assert.equal((await h.route.GET()).status, 404);
    assert.equal(h.counts().calls, 0);
  }
});

test('cross-origin POST cannot authenticate or mutate Azure', async () => {
  const h = harness();
  const response = await h.route.POST(new Request('https://jackyun.top/api/admin/azure-sync-check', {
    method: 'POST', headers: { origin: 'https://other.example' },
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(h.counts(), { calls: 0, authCalls: 0 });
});

test('authorized GET only displays the explicit verification form without Azure access', async () => {
  const h = harness();
  const response = await h.route.GET();
  assert.equal(response.status, 200);
  assert.match(await response.text(), /form method="post"/);
  assert.equal(h.counts().calls, 0);
});

test('upstream failure does not disclose credentials or upstream private messages', async () => {
  const h = harness();
  const response = await h.route.POST(new Request('https://jackyun.top/api/admin/azure-sync-check', {
    method: 'POST', headers: { origin: 'https://jackyun.top' },
  }));
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private-test-token|Upstream private/);
});
