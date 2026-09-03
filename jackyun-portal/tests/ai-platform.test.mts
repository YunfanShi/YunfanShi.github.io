import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validatePersonalSite } from '../src/lib/personal-site.ts';

test('personal site validator keeps only safe component types and web links', () => {
  const site = validatePersonalSite({ name: '学习主页', theme: 'purple', blocks: [
    { type: 'heading', text: '学习主页' },
    { type: 'links', title: '资源', items: [{ label: '安全', url: 'https://example.com' }, { label: '脚本', url: 'javascript:alert(1)' }] },
    { type: 'iframe', html: '<iframe src="https://evil.example">' },
  ] });
  assert.equal(site.theme, 'purple');
  assert.deepEqual(site.blocks.map((block) => block.type), ['heading', 'links']);
  const links = site.blocks[1];
  if (links.type === 'links') assert.deepEqual(links.items, [{ label: '安全', url: 'https://example.com' }]);
});

test('quota migration uses server-only atomic reservations and four plans', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260903100000_ai_platform_quotas_and_customization.sql', import.meta.url), 'utf8');
  for (const plan of ['free', 'plus', 'pro', 'ultra']) assert.match(sql, new RegExp(`\\('${plan}'`));
  assert.match(sql, /\('free', 'Free', 5000, 50000, 1000, 1\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /SITE_GENERATION_QUOTA_EXCEEDED/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reserve_ai_usage[\s\S]*authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reserve_ai_usage[\s\S]*service_role/);
});

test('LLM proxy strips internal metering controls before forwarding', () => {
  const route = readFileSync(new URL('../src/app/api/llm-proxy/route.ts', import.meta.url), 'utf8');
  assert.match(route, /delete upstreamFields\.feature/);
  assert.match(route, /delete upstreamFields\.providerMode/);
  assert.match(route, /reserve_ai_usage/);
  assert.match(route, /finalize_ai_usage/);
  assert.match(route, /keySource === 'cloud' \? model/);
  assert.match(route, /feature === 'reasoning'/);
  assert.match(route, /Math\.ceil\(streamedBytes \/ 8\)/);
  assert.match(route, /if \(!adminClient\)[\s\S]*服务端配额配置/);
});

test('BETA interface tools do not expose arbitrary code execution', () => {
  const tools = readFileSync(new URL('../src/lib/ai-tools.ts', import.meta.url), 'utf8');
  assert.match(tools, /id: 'customize_interface'/);
  assert.match(tools, /id: 'reset_interface_preferences'/);
  assert.doesNotMatch(tools, /\beval\s*\(/);
  assert.doesNotMatch(tools, /new Function\s*\(/);
});
