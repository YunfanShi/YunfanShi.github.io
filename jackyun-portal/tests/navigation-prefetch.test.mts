import assert from 'node:assert/strict';
import test from 'node:test';
import { canPrefetchNavigation } from '../src/lib/navigation-prefetch.ts';
import { NAVIGATION_ITEMS } from '../src/lib/navigation.ts';

const online = { signedIn: true, online: true };
const find = (id: string) => NAVIGATION_ITEMS.find(item => item.id === id)!;
test('optional prefetch never visits admin, BETA, gated or studio entries', () => {
  for (const id of ['admin', 'beta', 'reading', 'studio']) assert.equal(canPrefetchNavigation(find(id), online), false);
});
test('guest intent is limited to public read-only entries', () => {
  for (const id of ['tools', 'sleep', 'learning-resources']) assert.equal(canPrefetchNavigation(find(id), { ...online, signedIn: false }), true);
  for (const id of ['dashboard', 'schedule', 'review', 'settings', 'ielts-writing']) assert.equal(canPrefetchNavigation(find(id), { ...online, signedIn: false }), false);
});
test('offline, save-data, slow network and user opt-out suppress even safe intent', () => {
  for (const patch of [{ online: false }, { saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }, { enabled: false }]) assert.equal(canPrefetchNavigation(find('tools'), { ...online, ...patch }), false);
  assert.equal(canPrefetchNavigation(find('tools'), { ...online, effectiveType: '4g' }), true);
});
