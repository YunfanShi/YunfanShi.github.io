import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildDidaTask, didaSourceKey, isPushableLearningTask } from '../src/lib/integrations/dida365.ts';

const task = {
  key: 'interval-review:2026-09-21:math', title: '复习 Mathematics', detail: '闭卷回忆今天内容。',
  type: 'interval-review' as const, date: '2026-09-21', durationMinutes: 25, subjectName: 'Mathematics',
  mergedTaskKeys: ['weekly-review:2026-09-21:math', 'interval-review:2026-09-21:math'],
  mergedTasks: [
    { key: 'interval-review:2026-09-21:math', type: 'interval-review' as const, title: '间隔复习', detail: '完成 Recall。' },
    { key: 'weekly-review:2026-09-21:math', type: 'weekly-review' as const, title: '周末集中', detail: '检查本周薄弱点。' },
  ],
};

test('联合任务映射为一个滴答任务，并保留各子任务提示', () => {
  const payload = buildDidaTask(task, 'project-1');
  assert.equal(payload.projectId, 'project-1');
  assert.equal(payload.isAllDay, true);
  assert.equal(payload.items?.length, 2);
  assert.match(payload.content, /1\. \[间隔复习\] 间隔复习/);
  assert.match(payload.content, /2\. \[周末集中\] 周末集中/);
  assert.match(payload.content, /√ \/ △ \/ ○/);
});

test('课后学习闭环在滴答清单使用下课时间，并生成可勾选子任务', () => {
  const payload = buildDidaTask({
    key: 'course-review:2026-09-21:physics',
    title: '课后学习闭环 · Physics',
    detail: 'Notes → Cue → Recall → Evidence',
    type: 'course-review',
    date: '2026-09-21',
    start: '18:30',
    durationMinutes: 45,
    subjectName: 'Physics',
    mergedTasks: [
      { key: 'notes', type: 'completeness-audit', title: '补全并上传课堂笔记', detail: '检查缺口。' },
      { key: 'cues', type: 'study', title: '阅读笔记并生成 Cue', detail: '生成清晰 Cue。' },
      { key: 'recall', type: 'cue-review', title: '闭卷复习 Cue', detail: '记录状态。' },
    ],
  }, 'project-1');

  assert.equal(payload.isAllDay, false);
  assert.equal(payload.startDate, '2026-09-21T18:30:00+0800');
  assert.equal(payload.dueDate, '2026-09-21T19:15:00+0800');
  assert.deepEqual(payload.items?.map((item) => item.title), ['[完整性检查] 补全并上传课堂笔记', '[学习] 阅读笔记并生成 Cue', '[Cue 复习] 闭卷复习 Cue']);
});

test('来源键与合并顺序无关，避免重复创建任务', () => {
  assert.equal(didaSourceKey(task), didaSourceKey({ ...task, mergedTaskKeys: [...task.mergedTaskKeys].reverse() }));
});

test('只接受边界明确的 Schedule 任务数据', () => {
  assert.equal(isPushableLearningTask(task), true);
  assert.equal(isPushableLearningTask({ ...task, date: 'tomorrow' }), false);
  assert.equal(isPushableLearningTask({ ...task, type: 'unknown' }), false);
});

test('账户令牌加密保存，关联表启用按用户隔离的 RLS', () => {
  const accountRoute = readFileSync(new URL('../src/app/api/integrations/dida365/accounts/route.ts', import.meta.url), 'utf8');
  const taskRoute = readFileSync(new URL('../src/app/api/integrations/dida365/tasks/route.ts', import.meta.url), 'utf8');
  const scheduleUi = readFileSync(new URL('../src/components/modules/schedule/schedule-control.tsx', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../supabase/migrations/20260921025242_external_account_connections.sql', import.meta.url), 'utf8');
  assert.match(accountRoute, /encryptSecret\(token\)/);
  assert.ok(accountRoute.indexOf('encryptSecret(token)') < accountRoute.indexOf("from('external_accounts').insert"), 'token encryption must be checked before inserting an account row');
  assert.match(accountRoute, /账户关联数据库尚未升级/);
  assert.doesNotMatch(accountRoute, /access_token:\s*token/);
  assert.ok(scheduleUi.indexOf('playlist_add') < scheduleUi.indexOf('onPostpone(task)'), 'Dida action must appear above postpone');
  assert.match(taskRoute, /export async function GET/);
  assert.match(taskRoute, /select\('source_key'\)/);
  assert.match(scheduleUi, /didaAddedTaskKeys\.has\(didaSourceKey\(task\)\)/);
  assert.match(scheduleUi, /'已添加'/);
  for (const table of ['external_accounts', 'external_account_secrets', 'external_task_links']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /auth\.uid\(\)\) = user_id/);
});
