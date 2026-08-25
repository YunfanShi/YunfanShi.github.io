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
  extractDeviceNameFromCells(cells: string[], mac?: string, ip?: string): string;
  validateProfiles(value?: Record<string, { down?: unknown; up?: unknown }>): Record<string, { label: string; color: string; down: number; up: number }>;
  matchesAny(value: string, patterns: RegExp[]): boolean;
};

test('normalizes and extracts TR3000 device identifiers', () => {
  assert.equal(core.normalizeMac('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(core.extractMac('Phone AA:bb:cc:dd:ee:ff online'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(core.extractPrivateIp('client 192.168.10.25'), '192.168.10.25');
  assert.equal(core.extractPrivateIp('public 8.8.8.8'), undefined);
});

test('recognizes the TR3000 save-and-apply labels used by Chinese and English firmware', () => {
  const patterns = [/保存\s*(?:并|和|及|&)?\s*应用/i, /保存应用/i, /save\s*(?:and|&)?\s*apply/i];
  assert.equal(core.matchesAny('保存并应用', patterns), true);
  assert.equal(core.matchesAny('保存 & 应用', patterns), true);
  assert.equal(core.matchesAny('Save and Apply', patterns), true);
  assert.equal(core.matchesAny('取消', patterns), false);
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

test('does not mistake the TR3000 row number, Wi-Fi band, rate or signal for the device name', () => {
  assert.equal(
    core.extractDeviceNameFromCells(
      ['1', 'Junxiang WU\n2.4G WiFi', '192.168.10.28\nFA:D4:B9:61:55:40', '18.60 Kbps\n899.65 Kbps', '-53 dBm'],
      'FA:D4:B9:61:55:40',
      '192.168.10.28',
    ),
    'Junxiang WU',
  );
  assert.equal(
    core.extractDeviceNameFromCells(
      ['2', '未知\n5G WiFi', '192.168.10.32\n9A:28:DC:62:C1:A4', '0.00 Kbps', '-57 dBm'],
      '9A:28:DC:62:C1:A4',
      '192.168.10.32',
    ),
    '未命名设备',
  );
});
