import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/userscripts/tr3000-manager.user.js', import.meta.url), 'utf8');
const sandbox = { globalThis: {} as Record<string, unknown> };
vm.runInNewContext(source, sandbox, { filename: 'tr3000-manager.user.js' });
const core = sandbox.globalThis.__TR3000_MANAGER_CORE__ as {
  normalizeMac(value: string): string | undefined;
  extractMac(value: string): string | undefined;
  extractPrivateIp(value: string): string | undefined;
  cleanDeviceName(value: string, mac?: string, ip?: string): string;
  validateProfiles(value?: Record<string, { down?: unknown; up?: unknown }>): Record<string, { label: string; color: string; down: number; up: number }>;
};

test('normalizes and extracts TR3000 device identifiers', () => {
  assert.equal(core.normalizeMac('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(core.extractMac('Phone AA:bb:cc:dd:ee:ff online'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(core.extractPrivateIp('client 192.168.10.25'), '192.168.10.25');
  assert.equal(core.extractPrivateIp('public 8.8.8.8'), undefined);
});

test('validates all configurable quota profiles', () => {
  const profiles = core.validateProfiles({
    low: { down: 3.333, up: 1 },
    medium: { down: -1, up: 10001 },
    high: { down: 500, up: 80 },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(profiles)), {
    low: { label: '低配额', color: '#ef4444', down: 3.33, up: 1 },
    medium: { label: '中配额', color: '#f59e0b', down: 30, up: 10 },
    high: { label: '高配额', color: '#22c55e', down: 500, up: 80 },
  });
});

test('derives a local name without IP or MAC identifiers', () => {
  assert.equal(
    core.cleanDeviceName('Alex iPhone\n192.168.10.25\nAA:BB:CC:DD:EE:FF\n在线', 'AA:BB:CC:DD:EE:FF', '192.168.10.25'),
    'Alex iPhone',
  );
});
