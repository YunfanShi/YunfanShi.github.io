import test from 'node:test';
import assert from 'node:assert/strict';
import { announcementMatchesPath, announcementPhase, sortAnnouncements, announcementDismissalKey, safeAnnouncementLink, validateAnnouncement, announcementLocalTime } from '../src/lib/announcements.ts';
const now = Date.parse('2026-10-06T06:00:00Z');
const base = { id: 'notice', title: 'Scheduled maintenance', content: 'Service unavailable', is_active: true, start_time: null, end_time: null, created_at: '2026-10-06T01:00:00Z' };

test('page announcements match exact paths and descendants without leaking to similarly named pages', () => {
  const scoped = { scope_type: 'pages' as const, target_paths: ['/schedule', '/study'] };
  for (const path of ['/schedule', '/schedule/', '/schedule?tab=cue', '/study/tasks']) assert.equal(announcementMatchesPath(scoped, path), true);
  for (const path of ['/scheduler', '/studying', '/music', '/']) assert.equal(announcementMatchesPath(scoped, path), false);
  assert.equal(announcementMatchesPath({ scope_type: 'pages', target_paths: [] }, '/schedule'), false);
  assert.equal(announcementMatchesPath({}, '/music'), true, 'legacy announcements remain global');
  assert.equal(announcementMatchesPath({ scope_type: 'pages', target_paths: ['/'] }, '/study'), false);
});
test('schedule and expiry boundaries prevent early display and stop at the end time', () => {
  assert.equal(announcementPhase(base, now), 'live');
  assert.equal(announcementPhase({ ...base, start_time: new Date(now + 1).toISOString() }, now), 'scheduled');
  assert.equal(announcementPhase({ ...base, start_time: new Date(now).toISOString() }, now), 'live');
  assert.equal(announcementPhase({ ...base, end_time: new Date(now).toISOString() }, now), 'expired');
  assert.equal(announcementPhase({ ...base, is_active: false }, now), 'disabled');
});
test('pinning and priority give deterministic order without mutating history', () => {
  const items = [{ ...base, id: 'normal' }, { ...base, id: 'urgent', priority: 'urgent' as const }, { ...base, id: 'pinned', is_pinned: true }];
  assert.deepEqual(sortAnnouncements(items).map(item => item.id), ['pinned', 'urgent', 'normal']);
  assert.equal(items[0].id, 'normal');
});
test('ordinary edits keep dismissal identity while deliberate recovery reminders use a new revision', () => {
  assert.equal(announcementDismissalKey(base), 'notice@1');
  assert.equal(announcementDismissalKey({ ...base, revision: 2 }), 'notice@2');
});
test('form validation normalizes scope and keeps metadata and delivery choices', () => {
  const result = validateAnnouncement({ ...base, scope_type: 'pages', target_paths: ['/schedule/', '/schedule'], category: 'bug', priority: 'urgent', delivery_type: 'banner', incident_status: 'investigating', action_label: ' Help ', action_url: ' /help ' });
  assert.deepEqual(result.target_paths, ['/schedule']); assert.equal(result.delivery_type, 'banner'); assert.equal(result.incident_status, 'investigating'); assert.equal(result.action_url, '/help');
  assert.deepEqual(validateAnnouncement({ ...base, scope_type: 'global', target_paths: ['/schedule'] }).target_paths, []);
  assert.throws(() => validateAnnouncement({ ...base, scope_type: 'pages', target_paths: [] }), /选择/);
  assert.throws(() => validateAnnouncement({ ...base, target_paths: ['//evil.test'] }), /路径/);
  assert.throws(() => validateAnnouncement({ ...base, start_time: '2026-10-06T12:00:00Z', end_time: '2026-10-06T11:00:00Z' }), /结束时间/);
  assert.throws(() => validateAnnouncement({ ...base, category: 'toString' as never }), /分类/);
});
test('action links reject executable, protocol-relative and credentialed URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//evil.test', '/\\evil.test', 'https://user:password@host.test', '/has space']) assert.equal(safeAnnouncementLink(url), false);
  for (const url of ['/help', '/schedule?tab=cue', 'https://example.test/status']) assert.equal(safeAnnouncementLink(url), true);
  assert.throws(() => validateAnnouncement({ ...base, action_url: '/help' }), /一起/);
});
test('editing a scheduled announcement preserves the same instant through a local time input', () => {
  const iso = '2026-10-06T02:45:00.000Z';
  assert.equal(new Date(announcementLocalTime(iso)).toISOString(), iso);
  assert.equal(announcementLocalTime(null), '');
});
