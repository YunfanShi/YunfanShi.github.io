import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
  assert.match(layout, /Promise\.allSettled/);
  assert.match(portalError, /onClick=\{reset\}/);
  assert.match(adminError, /onClick=\{reset\}/);
});
