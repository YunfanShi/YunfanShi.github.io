import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeSeiueCalendar, normalizeSeiueLessons, normalizeSeiueTodos, parseSeiueDateTime, parseSeiueHelperBundle, safeSeiueSite, seiueCourseReviewKey } from '../src/lib/integrations/seiue.ts';

test('one-time browser-helper bundle accepts only bounded student credentials for an HTTPS SEIUE school site', () => {
  const bundle = JSON.stringify({ version: 1, token: 'synthetic-token-0123456789', reflectionId: '4226602', schoolId: '120', role: 'student', schoolSite: 'https://chalk-c3.seiue.com/' });
  assert.deepEqual(parseSeiueHelperBundle(bundle), { token: 'synthetic-token-0123456789', reflectionId: '4226602', schoolId: '120', role: 'student', schoolSite: 'https://chalk-c3.seiue.com/' });
  assert.equal(parseSeiueHelperBundle(JSON.stringify({ version: 1, token: 'synthetic-token-0123456789', reflectionId: '4226602', schoolId: '120', role: 'admin', schoolSite: 'https://chalk-c3.seiue.com/' })), null);
  assert.equal(parseSeiueHelperBundle(JSON.stringify({ version: 1, token: 'synthetic-token-0123456789', reflectionId: '4226602', schoolId: '120', role: 'student', schoolSite: 'https://attacker.example/' })), null);
  assert.equal(parseSeiueHelperBundle('Cookie: synthetic-secret'), null);
  assert.equal(parseSeiueHelperBundle('x'.repeat(6001)), null);
});

test('SEIUE helper is click-armed, route-limited, memory-only, and has no network or persistence channel', () => {
  const helper = readFileSync(new URL('../public/userscripts/seiue-connector.user.js', import.meta.url), 'utf8');
  assert.match(helper, /@grant\s+none/);
  assert.match(helper, /@include\s+\/\^https:/);
  assert.match(helper, /chalk-\[a-z0-9-\]/);
  assert.match(helper, /https:\/\/api\.seiue\.com/);
  assert.match(helper, /click/);
  assert.match(helper, /60_000/);
  assert.match(helper, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(helper, /localStorage|sessionStorage|document\.cookie|GM_xmlhttpRequest|@connect|console\.(log|info|warn|error)/i);
  assert.doesNotMatch(helper, /fetch\s*\(\s*['"`]/i);
});

test('SEIUE naive times are strict Asia/Shanghai wall clock values', () => {
  assert.deepEqual(parseSeiueDateTime('2026-10-23 09:05:00'), { date: '2026-10-23', time: '09:05', epoch: Date.UTC(2026, 9, 23, 1, 5) });
  assert.equal(parseSeiueDateTime('2026-02-30 09:00:00'), null);
  assert.equal(parseSeiueDateTime('2026-10-23 25:00:00'), null);
  assert.equal(parseSeiueDateTime('2026-10-23T09:00:00+08:00'), null);
});

test('course normalization keeps occurrence ID, content, instructor, location and adjustment', () => {
  const lessons = normalizeSeiueLessons([
    { type: 'lesson', title: '代数', subject: { name: '数学' }, start_time: '2026-10-23 09:00:00', end_time: '2026-10-23 09:45:00', address: 'A101', initiators: [{ name: '老师甲' }], remark: '课堂备注', custom: { id: 'occ-1', adjustment_status: 'adjusted' } },
    { type: 'lesson', start_time: '2026-02-30 09:00:00', end_time: '2026-02-30 10:00:00', custom: { id: 'bad-date' } },
    { type: 'unknown', custom: { id: 'unknown' } },
  ]);
  assert.equal(lessons.length, 1);
  assert.deepEqual(lessons[0], { id: 'occ-1', title: '代数', subject: '数学', date: '2026-10-23', start: '09:00', end: '09:45', location: 'A101', teacher: '老师甲', adjustment: 'adjusted', description: '课堂备注' });
  assert.equal(seiueCourseReviewKey(lessons[0]), 'seiue-course-review:occ-1');
});

test('todo pages deduplicate IDs and use top-level status plus the domain deadline', () => {
  const pages = [[
    { id: 'todo-1', title: '交实验报告', status: 'pending', type: 'seiue.task_submit_todo', related: { status: 'completed', expired_at: '2026-10-24 23:59:00', content: { blocks: [{ text: '上传 PDF' }, { text: '附数据表' }] } } },
    { id: 'todo-2', title: '选课', status: 'pending', type: 'seiue.scms.election.student', related: { end_at: '2026-10-25 12:00:00' } },
    { id: 'ignore', status: 'pending', related: { domain: 'unknown' } },
  ], [{ id: 'todo-1', title: '交实验报告', status: 'completed', type: 'seiue.task_submit_todo', related: { expired_at: '2026-10-24 23:59:00' } }]];
  const todos = normalizeSeiueTodos(pages);
  assert.equal(todos.length, 2);
  assert.equal(todos[0].status, 'completed');
  assert.match(todos[0].description ?? '', /上传 PDF\n附数据表/);
  assert.equal(todos[1].deadline, '2026-10-25 12:00:00');
  assert.throws(() => normalizeSeiueTodos([{}]));
});

test('calendar events are separate normalized events; unsafe school URLs are rejected', () => {
  assert.deepEqual(normalizeSeiueCalendar([{ id: 'holiday', title: '秋假', start_at: '2026-10-26', end_at: '2026-10-28' }]), [{ id: 'holiday', title: '秋假', date: '2026-10-26', endDate: '2026-10-28' }]);
  assert.throws(() => normalizeSeiueCalendar([{ id: 'invalid', title: 'bad', start_date: '2026-02-30' }]));
  assert.equal(safeSeiueSite('https://chalk-c3.seiue.com/'), 'https://chalk-c3.seiue.com/');
  assert.equal(safeSeiueSite('http://chalk-c3.seiue.com/'), null);
  assert.equal(safeSeiueSite('https://seiue.com.attacker.invalid/'), null);
  assert.equal(safeSeiueSite('https://chalk-c3.seiue.com@attacker.invalid/'), null);
  assert.equal(safeSeiueSite('https://api.seiue.com/'), null);
});

test('SEIUE server API is pinned to official HTTPS GET endpoints and never returns stored credentials', () => {
  const server = readFileSync(new URL('../src/lib/integrations/seiue-server.ts', import.meta.url), 'utf8');
  const domain = readFileSync(new URL('../src/lib/integrations/seiue.ts', import.meta.url), 'utf8');
  const accounts = readFileSync(new URL('../src/app/api/integrations/seiue/accounts/route.ts', import.meta.url), 'utf8');
  const snapshot = readFileSync(new URL('../src/app/api/integrations/seiue/snapshot/route.ts', import.meta.url), 'utf8');
  const disconnect = readFileSync(new URL('../src/app/api/integrations/seiue/accounts/[id]/route.ts', import.meta.url), 'utf8');
  assert.match(domain, /https:\/\/api\.seiue\.com/);
  assert.match(server, /method: 'GET'/);
  assert.match(server, /redirect: 'error'/);
  assert.doesNotMatch(server, /process\.env.*SEIUE|apiBaseUrl|proxyUrl/i);
  assert.doesNotMatch(accounts.slice(accounts.indexOf('export async function GET()'), accounts.indexOf('export async function POST')), /encrypted_access_token|token:/);
  assert.doesNotMatch(snapshot, /console\.(log|error)|encrypted_access_token\s*:/);
  assert.match(accounts, /Cache-Control/);
  assert.match(snapshot, /Cache-Control/);
  assert.match(accounts, /if \(!user\).*401/);
  assert.match(snapshot, /\.eq\('id', accountId\)\.eq\('user_id', user\.id\)\.eq\('provider', 'seiue'\)/);
  assert.match(disconnect, /\.eq\('id', id\)\.eq\('user_id', user\.id\)\.eq\('provider', 'seiue'\)/);
  assert.match(accounts, /sameOrigin\(request\)/);
  assert.ok(accounts.indexOf('encryptSecret(JSON.stringify(grant))') < accounts.indexOf('await verifySeiueToken(grant)'));
});
