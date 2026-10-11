/* eslint-disable @typescript-eslint/no-explicit-any -- VM fixtures expose dynamically evaluated browser globals. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';

function loadModule(path: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(javascript, { exports, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected import: ${name}`);
    return dependencies[name];
  }, process: { env: {} }, console, URL });
  return exports;
}

const refreshed = { name: 'sb-test-auth-token', value: 'fresh', options: { path: '/', maxAge: 86400, sameSite: 'lax' as const } };

test('refresh forwards fresh request cookies and persists all response cookie batches', async () => {
  let cookies: any;
  const middleware = loadModule('../src/lib/supabase/middleware.ts', {
    '@/lib/request-timeout': { fetchWithTimeout: async () => {} },
    '@supabase/ssr': { createServerClient: (_url: string, _key: string, options: any) => {
      cookies = options.cookies;
      return {};
    } },
    'next/server': { NextResponse },
  });
  const request = new NextRequest('https://example.com/dashboard', { headers: { cookie: 'sb-test-auth-token=old' } });
  const client = await middleware.createClient(request);
  cookies.setAll([refreshed]);
  cookies.setAll([{ name: 'sb-test-auth-token.1', value: '', options: { path: '/', maxAge: 0 } }]);
  assert.equal(client.response.headers.get('x-middleware-request-cookie'), 'sb-test-auth-token=fresh; sb-test-auth-token.1=');
  assert.equal(client.response.cookies.get(refreshed.name)?.value, 'fresh');
  assert.equal(client.response.cookies.get('sb-test-auth-token.1')?.maxAge, 0);
});

for (const scenario of ['unauthorized', 'restricted', 'account-status', 'non-admin', 'lookup-failure', 'missing-session', 'auth-failure']) {
  test(`proxy retains rotated cookies on ${scenario} response`, async () => {
    const proxy = loadModule('../src/proxy.ts', {
      '@/lib/admin-auth': { isAdminIdentity: () => false },
      'next/server': { NextResponse },
      '@/lib/supabase/middleware': { createClient: async () => {
        const response = NextResponse.next();
        response.cookies.set(refreshed.name, refreshed.value, refreshed.options);
        const result = { data: { role: 'user', account_status: scenario === 'restricted' ? 'suspended' : 'active' }, error: scenario === 'lookup-failure' ? { message: 'unavailable' } : null };
        const query: any = { select: () => query, eq: () => query, maybeSingle: async () => result };
        return { response, supabase: {
          auth: { getClaims: async () => ({ data: scenario === 'missing-session' || scenario === 'auth-failure' ? null : { claims: { sub: 'user', app_metadata: { provider: scenario === 'unauthorized' ? 'unknown' : 'google' } } }, error: scenario === 'auth-failure' ? { name: 'AuthRetryableFetchError', status: 503 } : null }) },
          from: () => query,
        } };
      } },
    });
    const request = new NextRequest(`https://example.com/${scenario === 'account-status' ? 'account-status' : 'admin'}`, { headers: { cookie: 'sb-test-auth-token=old' } });
    const response = await proxy.proxy(request);
    assert.equal(response.status, scenario.endsWith('failure') ? 503 : 307);
    assert.equal(response.cookies.get(refreshed.name)?.value, 'fresh');
    assert.equal(response.cookies.get(refreshed.name)?.maxAge, 86400);
  });
}
