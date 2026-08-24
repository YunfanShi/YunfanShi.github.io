import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firstSearchParam,
  normalizeMac,
  normalizeOptionalText,
  normalizePrivateIpv4,
} from '../src/lib/network-access.ts';

test('normalizes supported MAC address formats', () => {
  assert.equal(normalizeMac('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMac('AA:BB:CC:DD:EE:FF'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMac('not-a-mac'), undefined);
});

test('accepts only private IPv4 addresses', () => {
  assert.equal(normalizePrivateIpv4('192.168.10.25'), '192.168.10.25');
  assert.equal(normalizePrivateIpv4('10.1.30.8'), '10.1.30.8');
  assert.equal(normalizePrivateIpv4('172.31.2.9'), '172.31.2.9');
  assert.equal(normalizePrivateIpv4('8.8.8.8'), undefined);
  assert.equal(normalizePrivateIpv4('192.168.1.999'), undefined);
});

test('reads aliases and bounds optional text', () => {
  assert.equal(firstSearchParam({ clientmac: 'aa:bb:cc:dd:ee:ff' }, ['client_mac', 'clientmac']), 'aa:bb:cc:dd:ee:ff');
  assert.equal(firstSearchParam({ mac: ['first', 'second'] }, ['mac']), 'first');
  assert.equal(normalizeOptionalText('  abcdef  ', 4), 'abcd');
  assert.equal(normalizeOptionalText('   ', 10), undefined);
});
