import assert from 'node:assert/strict';
import test from 'node:test';
import {
  firstSearchParam,
  normalizeMac,
  normalizeOptionalText,
  normalizePrivateIpv4,
} from '../src/lib/network-access.ts';
import {
  createNetworkPortalSession,
  secretsMatch,
  verifyNetworkPortalSession,
} from '../src/lib/network-portal-session.ts';

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

test('creates and verifies a short-lived router portal session', () => {
  const secret = 'session-secret-that-is-at-least-32-characters';
  const now = 1_700_000_000_000;
  const token = createNetworkPortalSession({ clientIp: '192.168.10.25' }, secret, now);
  assert.ok(token);
  assert.equal(verifyNetworkPortalSession(token, secret, now)?.clientIp, '192.168.10.25');
  assert.equal(verifyNetworkPortalSession(token, secret, now + 16 * 60 * 1000), undefined);
  assert.equal(verifyNetworkPortalSession(`${token}x`, secret, now), undefined);
});

test('requires a sufficiently strong exact router entry key', () => {
  const key = 'router-entry-key-that-is-at-least-32-characters';
  assert.equal(secretsMatch(key, key), true);
  assert.equal(secretsMatch(`${key}x`, key), false);
  assert.equal(secretsMatch('short', 'short'), false);
});
