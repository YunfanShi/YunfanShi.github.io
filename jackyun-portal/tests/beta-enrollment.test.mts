import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isBetaActive, releaseChannel } from '../src/lib/beta.ts';

test('only an accepted invitation activates the BETA channel', () => {
  assert.equal(isBetaActive({ status: 'accepted' }), true);
  assert.equal(isBetaActive({ status: 'invited' }), false);
  assert.equal(isBetaActive({ status: 'declined' }), false);
  assert.equal(isBetaActive({ status: 'revoked' }), false);
  assert.equal(isBetaActive(null), false);
  assert.equal(releaseChannel({ status: 'accepted' }), 'BETA');
  assert.equal(releaseChannel({ status: 'declined' }), 'STABLE');
});

test('migration protects enrollment writes behind explicit RPCs', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260903090000_beta_enrollment_consent.sql', import.meta.url), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.beta_enrollments FROM anon, authenticated/i);
  assert.match(sql, /WHERE user_id = auth\.uid\(\) AND status = 'invited'/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.respond_to_beta_invitation\(boolean, text\) FROM PUBLIC, anon/i);
  assert.match(sql, /IF NOT public\.is_admin_user\(\)/i);
});

test('BETA agreement and badge remain explicit in the user interface', () => {
  const dialog = readFileSync(new URL('../src/components/modules/beta-experience.tsx', import.meta.url), 'utf8');
  const topbar = readFileSync(new URL('../src/components/layout/topbar.tsx', import.meta.url), 'utf8');
  const adminUsers = readFileSync(new URL('../src/components/admin/user-operations-panel.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /测试用户协议/);
  assert.match(dialog, /同意并加入 BETA/);
  assert.match(dialog, /拒绝，使用 Stable/);
  assert.match(topbar, /BETA v\{APP_VERSION\}/);
  assert.doesNotMatch(adminUsers, /user\.id !== currentUserId && !user\.deleted_at && \(betaByUser/);
  assert.match(adminUsers, /disabled=\{pending \|\| user\.id === currentUserId\}/);
});
