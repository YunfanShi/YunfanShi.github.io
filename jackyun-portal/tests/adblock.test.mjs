import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const extension = new URL('../companion-extension/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', extension), 'utf8'));

test('ad blocking is packaged, enabled by default, and never blocks top-level navigation', () => {
  assert.ok(manifest.permissions.includes('declarativeNetRequest'));
  assert.ok(manifest.content_scripts.some(({ js }) => js.includes('adblock.js')));
  const resources = manifest.declarative_net_request.rule_resources;
  assert.deepEqual(resources.map(({ id }) => id), ['ads_core', 'privacy_strict']);
  assert.ok(resources.every(({ enabled }) => enabled));

  const ids = new Set();
  for (const resource of resources) {
    const rules = JSON.parse(readFileSync(new URL(resource.path, extension), 'utf8'));
    assert.ok(rules.length > 0);
    for (const rule of rules) {
      assert.equal(rule.action.type, 'block');
      assert.ok(!ids.has(rule.id), `duplicate rule id ${rule.id}`);
      ids.add(rule.id);
      assert.ok(!rule.condition.resourceTypes.includes('main_frame'));
      if (rule.condition.regexFilter) assert.doesNotThrow(() => new RegExp(rule.condition.regexFilter));
    }
  }
});

async function runCosmeticScript(adblock) {
  const appended = [];
  const document = {
    readyState: 'complete',
    documentElement: { append: (node) => appended.push(node) },
    head: { append: (node) => appended.push(node) },
    createElement: () => ({ id: '', textContent: '' }),
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  const source = readFileSync(new URL('adblock.js', extension), 'utf8');
  vm.runInNewContext(source, {
    chrome: { storage: { local: { get: async () => ({ adblock }) } } },
    document,
    location: { hostname: 'news.example.cn' },
  });
  await new Promise((resolve) => setImmediate(resolve));
  return appended;
}

test('cosmetic filtering starts by default but respects the master switch and site allowlist', async () => {
  const defaultResult = await runCosmeticScript(undefined);
  assert.equal(defaultResult.length, 1);
  assert.match(defaultResult[0].textContent, /adsbygoogle/);
  assert.equal((await runCosmeticScript({ enabled: false })).length, 0);
  assert.equal((await runCosmeticScript({ enabled: true, siteAllowlist: ['example.cn'] })).length, 0);
});
