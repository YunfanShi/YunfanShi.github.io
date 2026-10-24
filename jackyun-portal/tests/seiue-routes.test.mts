import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const moduleSources: Record<string, string> = {
  '@/lib/supabase/server': `export async function createClient(){return globalThis.__seiueRouteTest.client()}`,
  '@/lib/secret-crypto': `export const encryptSecret=(value)=>globalThis.__seiueRouteTest.encrypt(value); export const decryptSecret=(value)=>globalThis.__seiueRouteTest.decrypt(value)`,
  '@/lib/integrations/seiue': `export const SEIUE_TOKEN_TTL_MS=86400000; export function safeSeiueSite(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname.endsWith('.seiue.com')&&u.hostname!=='api.seiue.com'?u.toString():null}catch{return null}}`,
  '@/lib/integrations/seiue-server': `export class SeiueApiError extends Error{constructor(message,status=502){super(message);this.status=status}} export async function verifySeiueToken(value){return globalThis.__seiueRouteTest.verify(value)} export async function fetchSeiueSnapshot(value,week){return globalThis.__seiueRouteTest.fetch(value,week)}`,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (moduleSources[specifier]) return { url: `seiue-route-test:${encodeURIComponent(specifier)}`, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('seiue-route-test:')) {
      const specifier = decodeURIComponent(url.slice('seiue-route-test:'.length));
      return { format: 'module', source: moduleSources[specifier], shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const accountsRoute = await import('../src/app/api/integrations/seiue/accounts/route.ts');
const snapshotRoute = await import('../src/app/api/integrations/seiue/snapshot/route.ts');
const disconnectRoute = await import('../src/app/api/integrations/seiue/accounts/[id]/route.ts');
const { SeiueApiError } = await import('@/lib/integrations/seiue-server');

const accountId = '11111111-1111-4111-8111-111111111111';
const grant = {
  token: 'synthetic-student-bearer-token-123456',
  reflectionId: 'reflection-1', schoolId: 'school-1', role: 'student',
  schoolSite: 'https://chalk-c3.seiue.com/',
};

type Row = Record<string, any>;
type State = ReturnType<typeof stateFor>;

function stateFor(overrides: Partial<{ user: { id: string } | null; failEncrypt: boolean; verifyError: Error | null; fetchError: Error | null; fetchValue: unknown } > = {}) {
  const state = {
    user: overrides.user === undefined ? { id: 'user-1' } : overrides.user,
    accounts: [] as Row[], secrets: [] as Row[], calls: [] as string[],
    failEncrypt: overrides.failEncrypt ?? false,
    verifyError: overrides.verifyError ?? null,
    fetchError: overrides.fetchError ?? null,
    fetchValue: overrides.fetchValue ?? { lessons: [], todos: [], calendar: [] },
    verifyCount: 0, fetchCount: 0,
    encrypt(value: string) {
      if (state.failEncrypt) throw new Error('AI_CONFIG_ENCRYPTION_KEY is not configured');
      return `cipher.${Buffer.from(value).toString('base64url')}`;
    },
    decrypt(value: string) { return Buffer.from(value.slice('cipher.'.length), 'base64url').toString('utf8'); },
    verify(_value: unknown) { state.verifyCount += 1; if (state.verifyError) throw state.verifyError; },
    fetch(_value: unknown, _week: string) { state.fetchCount += 1; if (state.fetchError) throw state.fetchError; return state.fetchValue; },
    client() {
      return {
        auth: { getUser: async () => ({ data: { user: state.user } }) },
        from(table: string) { return new Query(state, table); },
      };
    },
  };
  Object.assign(globalThis, { __seiueRouteTest: state });
  return state;
}

class Query {
  private operation: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private filters: Array<[string, unknown]> = [];
  private resultShape: 'many' | 'single' | 'maybeSingle' = 'many';
  private selected = false;

  private readonly state: State;
  private readonly table: string;
  constructor(state: State, table: string) { this.state = state; this.table = table; }
  select(_columns?: string) { this.selected = true; return this; }
  eq(column: string, value: unknown) { this.filters.push([column, value]); return this; }
  order(_column: string) { return this; }
  insert(value: Row | Row[]) { this.operation = 'insert'; this.payload = value; return this; }
  upsert(value: Row, _options?: unknown) { this.operation = 'upsert'; this.payload = value; return this; }
  update(value: Row) { this.operation = 'update'; this.payload = value; return this; }
  delete() { this.operation = 'delete'; return this; }
  single() { this.resultShape = 'single'; return Promise.resolve(this.execute()); }
  maybeSingle() { this.resultShape = 'maybeSingle'; return Promise.resolve(this.execute()); }
  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) { return Promise.resolve(this.execute()).then(resolve, reject); }

  private execute() {
    this.state.calls.push(`${this.table}.${this.operation}:${this.filters.map(([key, value]) => `${key}=${String(value)}`).join('&')}`);
    const rows: Row[] = this.table === 'external_accounts' ? this.state.accounts : this.state.secrets;
    const matches = () => rows.filter(row => this.filters.every(([key, value]) => row[key] === value));
    let data: unknown = null;
    if (this.operation === 'select') {
      const found = matches();
      data = this.resultShape === 'single' || this.resultShape === 'maybeSingle' ? found[0] ?? null : found;
    } else if (this.operation === 'insert') {
      const input = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const inserted = input.map(item => ({ ...item, ...(this.table === 'external_accounts' ? { id: accountId } : {}) }));
      rows.push(...inserted);
      data = this.selected ? inserted[0] : null;
    } else if (this.operation === 'upsert') {
      const item = this.payload as Row;
      const found = rows.find(row => row.account_id === item.account_id);
      if (found) Object.assign(found, item); else rows.push({ ...item });
    } else if (this.operation === 'update') {
      for (const row of matches()) Object.assign(row, this.payload);
    } else if (this.operation === 'delete') {
      const found = matches();
      for (const row of found) rows.splice(rows.indexOf(row), 1);
      if (this.table === 'external_accounts') {
        for (const row of found) this.state.secrets = this.state.secrets.filter(secret => secret.account_id !== row.id || secret.user_id !== row.user_id);
      }
      data = this.selected ? found[0] ?? null : null;
    }
    return { data, error: null };
  }
}

function request(url: string, method = 'GET', body?: unknown, origin = 'https://app.test') {
  return new Request(url, { method, headers: { ...(origin ? { origin } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

function seedAccount(state: State, userId = 'user-1', expiresAt = new Date(Date.now() + 60_000).toISOString()) {
  state.accounts.push({ id: accountId, user_id: userId, provider: 'seiue', display_name: 'Student', status: 'active', settings: { ...grant, tokenExpiresAt: expiresAt }, last_verified_at: null, created_at: new Date().toISOString() });
  state.secrets.push({ account_id: accountId, user_id: userId, encrypted_access_token: state.encrypt(JSON.stringify({ ...grant, expiresAt })) });
}

test('unauthenticated account, snapshot and disconnect requests fail closed without cacheable output', async () => {
  const state = stateFor({ user: null });
  const accounts = await accountsRoute.GET();
  const snapshot = await snapshotRoute.GET(request(`https://app.test/api/integrations/seiue/snapshot?accountId=${accountId}&week=2026-10-23`));
  const disconnect = await disconnectRoute.DELETE(request(`https://app.test/api/integrations/seiue/accounts/${accountId}`, 'DELETE'), { params: Promise.resolve({ id: accountId }) });
  for (const response of [accounts, snapshot, disconnect]) {
    assert.equal(response.status, 401);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  }
  assert.equal(state.fetchCount, 0);
  assert.equal(state.accounts.length, 0);
});

test('connection writes require same origin and reject missing encryption keys before verification or storage', async () => {
  const state = stateFor({ failEncrypt: true });
  const crossOrigin = await accountsRoute.POST(request('https://app.test/api/integrations/seiue/accounts', 'POST', grant, 'https://attacker.test'));
  assert.equal(crossOrigin.status, 403);
  const unavailableKey = await accountsRoute.POST(request('https://app.test/api/integrations/seiue/accounts', 'POST', grant));
  assert.equal(unavailableKey.status, 500);
  assert.match((await unavailableKey.json()).error, /加密密钥/);
  assert.equal(state.verifyCount, 0);
  assert.equal(state.accounts.length, 0);
  assert.equal(state.secrets.length, 0);
});

test('invalid SEIUE tokens are rejected before any account or secret row is written', async () => {
  const state = stateFor({ verifyError: new SeiueApiError('SEIUE Token 已失效。', 401) });
  const response = await accountsRoute.POST(request('https://app.test/api/integrations/seiue/accounts', 'POST', grant));
  assert.equal(response.status, 401);
  assert.equal(state.verifyCount, 1);
  assert.equal(state.accounts.length, 0);
  assert.equal(state.secrets.length, 0);
});

test('successful connection stores ciphertext and account listing never returns credentials', async () => {
  const state = stateFor();
  const created = await accountsRoute.POST(request('https://app.test/api/integrations/seiue/accounts', 'POST', grant));
  assert.equal(created.status, 201);
  assert.equal(state.accounts.length, 1);
  assert.equal(state.secrets.length, 1);
  assert.match(state.secrets[0].encrypted_access_token, /^cipher\./);
  assert.equal(state.secrets[0].encrypted_access_token.includes(grant.token), false);
  const listed = await accountsRoute.GET();
  const body = await listed.text();
  assert.equal(listed.status, 200);
  assert.equal(body.includes(grant.token), false);
  assert.equal(body.includes('encrypted_access_token'), false);
  assert.match(listed.headers.get('cache-control') ?? '', /no-store/);
});

test('cross-user account IDs cannot renew or fetch another user snapshot', async () => {
  const state = stateFor();
  seedAccount(state, 'user-2');
  const renew = await accountsRoute.PATCH(request('https://app.test/api/integrations/seiue/accounts', 'PATCH', { accountId, token: grant.token }));
  const snapshot = await snapshotRoute.GET(request(`https://app.test/api/integrations/seiue/snapshot?accountId=${accountId}&week=2026-10-23`));
  assert.equal(renew.status, 404);
  assert.equal(snapshot.status, 404);
  assert.equal(state.verifyCount, 0);
  assert.equal(state.fetchCount, 0);
  assert.equal(state.accounts[0].user_id, 'user-2');
  assert.equal(state.secrets[0].user_id, 'user-2');
});

test('snapshot returns normalized data only and never includes authorization material', async () => {
  const state = stateFor({ fetchValue: { lessons: [{ id: 'lesson-1' }], todos: [], calendar: [] } });
  seedAccount(state);
  const response = await snapshotRoute.GET(request(`https://app.test/api/integrations/seiue/snapshot?accountId=${accountId}&week=2026-10-23`));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(state.fetchCount, 1);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.match(body, /lesson-1/);
  assert.equal(body.includes(grant.token), false);
  assert.equal(body.includes(grant.reflectionId), false);
  assert.equal(body.includes(grant.schoolId), false);
  assert.equal(body.includes('encrypted_access_token'), false);
});

test('SEIUE 401 deletes only that user secret; 403 keeps the secret and marks the account for attention', async () => {
  const unauthorized = stateFor({ fetchError: new SeiueApiError('SEIUE Token 已失效。', 401) });
  seedAccount(unauthorized);
  const noLongerAuthorized = await snapshotRoute.GET(request(`https://app.test/api/integrations/seiue/snapshot?accountId=${accountId}&week=2026-10-23`));
  assert.equal(noLongerAuthorized.status, 401);
  assert.equal(unauthorized.secrets.length, 0);
  assert.equal(unauthorized.accounts[0].status, 'error');

  const forbidden = stateFor({ fetchError: new SeiueApiError('SEIUE 拒绝访问。', 403) });
  seedAccount(forbidden);
  const denied = await snapshotRoute.GET(request(`https://app.test/api/integrations/seiue/snapshot?accountId=${accountId}&week=2026-10-23`));
  assert.equal(denied.status, 403);
  assert.equal(forbidden.secrets.length, 1);
  assert.equal(forbidden.accounts[0].status, 'error');
  assert.equal((await denied.text()).includes(grant.token), false);
});

test('expired account listing deletes stored ciphertext; renewal must use a fresh valid token', async () => {
  const state = stateFor();
  seedAccount(state, 'user-1', new Date(Date.now() - 60_000).toISOString());
  const response = await accountsRoute.GET();
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(state.secrets.length, 0);
  assert.equal(state.accounts[0].status, 'error');
  assert.match(body, /"status":"error"/);
  assert.equal(body.includes(grant.token), false);
});

test('cross-user disconnect is a non-leaking 404 and owner disconnect cascades credentials', async () => {
  const state = stateFor();
  seedAccount(state, 'user-2');
  const wrongOwner = await disconnectRoute.DELETE(request(`https://app.test/api/integrations/seiue/accounts/${accountId}`, 'DELETE'), { params: Promise.resolve({ id: accountId }) });
  assert.equal(wrongOwner.status, 404);
  assert.equal(state.accounts.length, 1);
  assert.equal(state.secrets.length, 1);
  assert.equal(state.accounts[0].user_id, 'user-2');

  state.user = { id: 'user-2' };
  const owner = await disconnectRoute.DELETE(request(`https://app.test/api/integrations/seiue/accounts/${accountId}`, 'DELETE'), { params: Promise.resolve({ id: accountId }) });
  assert.equal(owner.status, 200);
  assert.equal(state.accounts.length, 0);
  assert.equal(state.secrets.length, 0);
});
