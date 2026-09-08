import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BETA_FEATURES, COMPANION_BETA_VERSION, isBetaActive, releaseChannel } from '../src/lib/beta.ts';

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
  assert.match(adminUsers, /当前管理员账户已切换到 BETA/);
});

test('BETA test center publishes the real feature and Companion versions', () => {
  const manifest = JSON.parse(readFileSync(new URL('../companion-extension/manifest.json', import.meta.url), 'utf8'));
  const release = JSON.parse(readFileSync(new URL('../public/downloads/companion-release.json', import.meta.url), 'utf8'));
  const page = readFileSync(new URL('../src/app/(portal)/beta/page.tsx', import.meta.url), 'utf8');
  const bridge = readFileSync(new URL('../src/components/modules/browser-ai-bridge.tsx', import.meta.url), 'utf8');
  const companionBridge = readFileSync(new URL('../companion-extension/content.js', import.meta.url), 'utf8');
  assert.equal(manifest.version, COMPANION_BETA_VERSION);
  assert.equal(release.previewVersion, COMPANION_BETA_VERSION);
  assert.deepEqual(BETA_FEATURES.map((feature) => feature.id), ['browser-ai', 'companion-ai', 'site-studio']);
  assert.match(page, /status !== 'accepted'/);
  assert.match(page, /BetaFeedbackForm/);
  assert.match(bridge, /未检测到 Companion/);
  assert.ok(manifest.content_scripts.some((entry: { matches?: string[] }) => entry.matches?.includes('https://*.jackyun.top/*')));
  assert.match(companionBridge, /JACKYUN_COMPANION_READY/);
  assert.match(companionBridge, /Companion 后台未能处理请求/);
});

test('repair migration lets admins self-enroll and promote users through guarded RPCs', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260906121742_sync_beta_admin_repair.sql', import.meta.url), 'utf8');
  assert.match(sql, /p_invited and is_self then 'accepted'/i);
  assert.match(sql, /create or replace function public\.admin_set_user_role/i);
  assert.match(sql, /if not public\.is_admin_user\(\)/i);
  assert.match(sql, /revoke all on function public\.admin_set_user_role\(uuid, text\) from public, anon/i);
  const users = readFileSync(new URL('../src/components/admin/user-operations-panel.tsx', import.meta.url), 'utf8');
  assert.match(users, /提权为 ADMIN/);
});
