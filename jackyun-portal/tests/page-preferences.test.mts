import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePagePreferences, PAGE_PROFILES } from '../src/lib/page-preferences.ts';
test('page preferences isolate pages, reject unknown values and never include admin or beta pages', () => {
 const result = sanitizePagePreferences({ 'dashboard:size': 'large', 'schedule:motion': false, 'dashboard:width': 'invalid', 'admin:size': 'large', intentPrefetch: false });
 assert.equal(result['dashboard:size'], 'large');
 assert.equal(result['schedule:size'], 'normal');
 assert.equal(result['schedule:motion'], false);
 assert.equal(result['dashboard:width'], 'full');
 assert.equal(result['admin:size'], undefined);
 assert.equal(result.intentPrefetch, false);
 assert.ok(PAGE_PROFILES.some(page => page.id === 'studio'));
 assert.ok(PAGE_PROFILES.some(page => page.id === 'reading'));
 assert.ok(!PAGE_PROFILES.some(page => page.id === 'beta'));
});
test('null or malformed cloud and local page preferences safely fall back to defaults', () => {
 for (const value of [null, [], 'broken']) {
  const result = sanitizePagePreferences(value);
  assert.equal(result['dashboard:size'], 'normal');
  assert.equal(result['dashboard:width'], 'full');
  assert.equal(result['dashboard:motion'], true);
 }
});
