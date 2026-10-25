import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('ID login resolves credentials on the server without returning account email to the browser', () => {
  const action = readFileSync(new URL('../src/actions/auth.ts', import.meta.url), 'utf8');
  const form = readFileSync(new URL('../src/components/auth/email-login-form.tsx', import.meta.url), 'utf8');
  assert.match(action, /export async function signInWithIdentifier/);
  assert.match(action, /createAdminClient\(\)/);
  assert.match(action, /signInWithPassword\(\{ email, password \}\)/);
  assert.doesNotMatch(form, /resolveUsernameToEmail/);
  assert.match(form, /signInWithIdentifier\(identifier, password\)/);
});

test('admin can create a confirmed ID/password account with an optional recovery email', () => {
  const action = readFileSync(new URL('../src/actions/admin.ts', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/admin/user-operations-panel.tsx', import.meta.url), 'utf8');
  assert.match(action, /export async function createUserAccount/);
  assert.match(action, /admin\.auth\.admin\.createUser/);
  assert.match(action, /username: loginId/);
  assert.match(panel, /直接创建 ID \/ 密码账户/);
});

test('portal shell failures degrade to defaults and routes expose retry boundaries', () => {
  const layout = readFileSync(new URL('../src/app/(portal)/layout.tsx', import.meta.url), 'utf8');
  const portalError = readFileSync(new URL('../src/app/(portal)/error.tsx', import.meta.url), 'utf8');
  const adminError = readFileSync(new URL('../src/app/admin/error.tsx', import.meta.url), 'utf8');
  const adminNavigation = readFileSync(new URL('../src/components/admin/admin-navigation.tsx', import.meta.url), 'utf8');
  assert.match(layout, /Promise\.allSettled/);
  assert.match(portalError, /onClick=\{reset\}/);
  assert.match(adminError, /window\.location\.reload\(\)/);
  assert.match(adminNavigation, /prefetch=\{false\}/);
});

test('temporary Auth and account lookup failures retain offline writes', () => {
  const syncOutbox = readFileSync(new URL('../src/lib/sync/outbox.ts', import.meta.url), 'utf8');
  const offlineWorkspace = readFileSync(new URL('../src/lib/offline/workspace.ts', import.meta.url), 'utf8');
  const proxy = readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8');
  const syncAuthError = readFileSync(new URL('../src/lib/sync/auth-error.ts', import.meta.url), 'utf8');
  const syncBinder = syncOutbox.slice(syncOutbox.indexOf('export async function bindSyncUser'));
  const offlineBinder = offlineWorkspace.slice(offlineWorkspace.indexOf('export async function bindOfflineWorkspaceUser'), offlineWorkspace.indexOf('export async function clearOfflineWorkspace'));
  assert.match(syncBinder, /if \(!userId\) return/);
  assert.doesNotMatch(syncBinder, /store\.clear\(\)/);
  assert.match(offlineBinder, /if \(!userId\) return/);
  assert.doesNotMatch(offlineBinder, /clearStores\(\)/);
  assert.match(proxy, /if \(lookupFailed\)/);
  assert.match(proxy, /new NextResponse[\s\S]*status: 503/);
  assert.match(syncAuthError, /AuthSessionMissingError/);
});


test('offline account binding retains writes across auth failure and permits only safe account changes', async () => {
  const workspace = readFileSync(new URL('../src/lib/offline/workspace.ts', import.meta.url), 'utf8');
  const source = workspace.slice(workspace.indexOf('export async function bindOfflineWorkspaceUser'), workspace.indexOf('export async function clearOfflineWorkspace'));
  const javascript = ts.transpileModule(source.replace('export async', 'async'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let owner = 'original';
  let pending = [{ id: 'unsent', value: 'learning evidence' }];
  let cleared = 0;
  const bind = runInNewContext(javascript + '\nbindOfflineWorkspaceUser', {
    USER_KEY: 'owner',
    listOfflineMutations: async () => pending,
    clearStores: async () => { cleared += 1; pending = []; },
    transact: async (_store: string, mode: string, operation: (transaction: unknown) => unknown) => {
      if (mode === 'readonly') return { key: 'owner', value: owner };
      return operation({ objectStore: () => ({ put: (row: { value: string }) => { owner = row.value; } }) });
    },
  }) as (userId: string | null) => Promise<void>;
  await bind(null);
  assert.equal(cleared, 0);
  assert.equal(pending[0].value, 'learning evidence');
  await bind('original');
  assert.equal(cleared, 0);
  await bind('another');
  assert.equal(owner, 'another');
  assert.equal(pending[0].value, 'learning evidence');
  pending = [];
  await bind('another');
  assert.equal(cleared, 0);
  assert.equal(owner, 'another');
});
