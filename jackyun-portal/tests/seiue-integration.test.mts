import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { isSeiueCalendarEventInWeek, normalizeSeiueCalendar, normalizeSeiueLessons, normalizeSeiueTodos, parseSeiueDateTime, parseSeiueHelperBundle, safeSeiueSite, seiueCourseReviewKey, type SeiueSnapshot } from '../src/lib/integrations/seiue.ts';
import { getSeiueSnapshot, withSeiueSnapshot } from '../src/lib/integrations/seiue-snapshot-cache.ts';

test('snapshot cache is scoped by account and selected week and preserves the last success on failure', () => {
  const monday: SeiueSnapshot = { lessons: [{ id: 'week-1', title: 'Algebra', subject: 'Math', date: '2026-10-20', start: '09:00', end: '09:45' }], todos: [], calendar: [], syncedAt: '2026-10-24T00:00:00.000Z' };
  const cache = withSeiueSnapshot({}, 'account-1', '2026-10-19', monday);
  assert.equal(getSeiueSnapshot(cache, 'account-1', '2026-10-19'), monday);
  assert.equal(getSeiueSnapshot(cache, 'account-1', '2026-10-26'), null);
  assert.equal(getSeiueSnapshot(cache, 'account-2', '2026-10-19'), null);
  assert.equal(withSeiueSnapshot(cache, 'account-1', 'invalid-week', monday), cache);
  // A failed refresh does not call withSeiueSnapshot, so the cached success stays intact.
  assert.equal(getSeiueSnapshot(cache, 'account-1', '2026-10-19'), monday);
});

test('one-time browser-helper bundle accepts only bounded student credentials for an HTTPS SEIUE school site', () => {
  const bundle = JSON.stringify({ version: 1, token: 'synthetic-token-0123456789', reflectionId: '4226602', schoolId: '120', role: 'student', schoolSite: 'https://chalk-c3.seiue.com/' });
  assert.deepEqual(parseSeiueHelperBundle(bundle), { token: 'synthetic-token-0123456789', reflectionId: '4226602', schoolId: '120', role: 'student', schoolSite: 'https://chalk-c3.seiue.com/' });
  assert.equal(parseSeiueHelperBundle(JSON.stringify({ version: 1, token: 'synthetic-token-0123456789', reflectionId: '4226602', schoolId: '120', role: 'admin', schoolSite: 'https://chalk-c3.seiue.com/' })), null);
  assert.equal(parseSeiueHelperBundle(JSON.stringify({ version: 1, token: 'synthetic-token-0123456789', reflectionId: '4226602', schoolId: '120', role: 'student', schoolSite: 'https://attacker.example/' })), null);
  assert.equal(parseSeiueHelperBundle('Cookie: synthetic-secret'), null);
  assert.equal(parseSeiueHelperBundle('x'.repeat(6001)), null);
});

test('SEIUE helper auto-detects only a bounded course request, keeps memory-only, and waits for a click to copy', () => {
  const helper = readFileSync(new URL('../public/userscripts/seiue-connector.user.js', import.meta.url), 'utf8');
  assert.match(helper, /@grant\s+none/);
  assert.match(helper, /@include\s+\/\^https:/);
  assert.match(helper, /chalk-\[a-z0-9-\]/);
  assert.match(helper, /https:\/\/api\.seiue\.com/);
  assert.match(helper, /let armed = true/);
  assert.match(helper, /installHooks\(\);\s*timeoutId = window\.setTimeout/);
  assert.match(helper, /copyButton\.addEventListener\('click', copyBundle\)/);
  assert.match(helper, /navigator\.clipboard\.writeText/);
  assert.match(helper, /60_000/);
  assert.ok(helper.includes('const EVENT_PATH = /^\\/chalk\\/calendar\\/personals'));
  assert.doesNotMatch(helper, /localStorage|sessionStorage|document\.cookie|GM_xmlhttpRequest|@connect|console\.(log|info|warn|error)/i);
  assert.doesNotMatch(helper, /fetch\s*\(\s*['"`]/i);
});

test('SEIUE helper forwards the fetch and XHR call that triggers one-time capture', async () => {
  const helper = readFileSync(new URL('../public/userscripts/seiue-connector.user.js', import.meta.url), 'utf8');
  let fetchCalls = 0;
  let xhrCalls = 0;
  class MockXhr {
    open() {}
    setRequestHeader() {}
    send() { xhrCalls += 1; return 'sent'; }
  }
  const windowMock = {
    fetch() { fetchCalls += 1; return Promise.resolve(new Response(null, { status: 204 })); },
    setTimeout() { return 1; }, clearTimeout() {},
  };
  runInNewContext(helper, {
    window: windowMock,
    location: { protocol: 'https:', hostname: 'chalk-c3.seiue.com', origin: 'https://chalk-c3.seiue.com', href: 'https://chalk-c3.seiue.com/' },
    document: { readyState: 'loading', addEventListener() {} },
    XMLHttpRequest: MockXhr, Headers, Request, URL, WeakMap, String, RegExp, Promise,
    navigator: {},
  });
  const headers = { Authorization: 'Bearer synthetic-token-0123456789', 'X-Reflection-Id': '4226602', 'X-School-Id': '120', 'X-Role': 'student' };
  await windowMock.fetch('https://api.seiue.com/chalk/calendar/personals/4226602/events', { method: 'GET', headers });
  assert.equal(fetchCalls, 1);
  assert.equal(windowMock.fetch.name, 'fetch');
  const xhr = new MockXhr() as MockXhr & { open: (method: string, url: string) => void; setRequestHeader: (name: string, value: string) => void };
  xhr.open('GET', 'https://api.seiue.com/chalk/calendar/personals/4226602/events');
  for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
  assert.equal(xhr.send(), 'sent');
  assert.equal(xhrCalls, 1);
});

test('single-day SEIUE calendar events only appear in their own week', () => {
  const weekStart = '2026-10-19';
  const weekEnd = '2026-10-25';
  assert.equal(isSeiueCalendarEventInWeek({ date: '2026-10-18' }, weekStart, weekEnd), false);
  assert.equal(isSeiueCalendarEventInWeek({ date: '2026-10-19' }, weekStart, weekEnd), true);
  assert.equal(isSeiueCalendarEventInWeek({ date: '2026-10-26' }, weekStart, weekEnd), false);
  assert.equal(isSeiueCalendarEventInWeek({ date: '2026-10-17', endDate: '2026-10-21' }, weekStart, weekEnd), true);
});

test('SEIUE connection instructions warn users not to share authorization screenshots', () => {
  const panel = readFileSync(new URL('../src/components/settings/account-connections-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /不要分享包含 Authorization 请求头或连接包的截图/);
  assert.match(panel, /不要把 Token、连接包或请求详情截图发给任何人/);
  const schedule = readFileSync(new URL('../src/components/modules/schedule/seiue-schedule-sync.tsx', import.meta.url), 'utf8');
  assert.match(schedule, /if \(todo\.status !== 'pending'\) return false/);
  assert.match(schedule, /截止：\{todo\.deadline/);
  assert.match(schedule, /todo\.courseName/);
  assert.match(schedule, /前往 SEIUE 查看 \/ 提交/);
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
    { id: 'todo-1', title: '交实验报告', status: 'pending', type: 'seiue.task_submit_todo', related: { status: 'completed', expired_at: '2026-10-24 23:59:00', content: { blocks: [{ text: '上传 PDF' }, { text: '附数据表' }] }, group: { name: '物理实验' }, creator: { name: '老师甲' }, labels: { type: 'seiue.class_homework_task' } } },
    { id: 'todo-2', title: '选课', status: 'pending', type: 'seiue.scms.election.student', related: { end_at: '2026-10-25 12:00:00' } },
    { id: 'todo-partial', title: '已忽略的旧作业', status: 'ignored', type: 'seiue.task_submit_todo' },
    { id: 'todo-domain', title: '补选截止', status: 'pending', domain: 'election', related: { end_at: '2026-10-26 12:00:00' } },
    { id: 'todo-domain-task', title: '材料阅读', status: 'pending', type: 'seiue.task_submit_todo_v2', domain: 'task' },
    { id: 20261024001, title: '数值 ID 作业', status: 'pending', type: 'seiue.task_submit_todo', domain: 'task' },
    { id: 'ignore', status: 'pending', related: { domain: 'unknown' } },
  ], [{ id: 'todo-1', title: '交实验报告', status: 'completed', type: 'seiue.task_submit_todo', related: { expired_at: '2026-10-24 23:59:00' } }]];
  const todos = normalizeSeiueTodos(pages);
  assert.equal(todos.length, 6);
  assert.equal(todos[0].status, 'completed');
  assert.equal(todos[0].courseName, '物理实验');
  assert.equal(todos[0].creatorName, '老师甲');
  assert.equal(todos[0].assignmentType, '课程作业');
  assert.equal(todos[0].deadline, '2026-10-24 23:59');
  assert.match(todos[0].description ?? '', /上传 PDF\n附数据表/);
  assert.equal(todos[1].deadline, '2026-10-25 12:00');
  assert.equal(todos[2].id, 'todo-partial');
  assert.equal(todos[2].status, 'ignored');
  assert.equal(todos[2].deadline, undefined);
  assert.equal(todos[3].kind, 'election');
  assert.equal(todos[3].deadline, '2026-10-26 12:00');
  assert.equal(todos[4].kind, 'assignment');
  assert.equal(todos[4].status, 'pending');
  assert.equal(todos[5].id, '20261024001');
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
