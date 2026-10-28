import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_BACKUP_PAGES, BACKUP_TABLES, isBackupableLegacyKey, isBackupableSettingKey, legacyBackupPage, normalizeBackupPages, tableBackupPage } from '../src/lib/backup/pages.ts';
import { getLocalBackupLimit } from '../src/lib/backup/local.ts';
import { applyLocalPageImport, parseLocalPageBackup } from '../src/lib/backup/local-import.ts';

test('local backup retention stays at ten even with an older preference', () => {
  assert.equal(getLocalBackupLimit(), 10);
});

test('every exported table belongs to a selectable backup page', () => {
  for (const table of BACKUP_TABLES) {
    if (table !== 'legacy_sync_data') assert.ok(ALL_BACKUP_PAGES.includes(tableBackupPage(table)), table);
  }
  assert.equal(tableBackupPage('quiz_questions'), 'quiz');
  assert.equal(tableBackupPage('review_items'), 'quiz');
  assert.equal(tableBackupPage('timetable_hub_data'), 'schedule');
  assert.equal(tableBackupPage('reader_books'), 'reader');
  assert.equal(legacyBackupPage('jackyun_schedule_control_v1'), 'schedule');
  assert.equal(legacyBackupPage('jackyun_definition_cards_v1'), 'definitions');
  assert.deepEqual(normalizeBackupPages(['schedule', 'schedule', 'quiz']), ['schedule', 'quiz']);
  assert.throws(() => normalizeBackupPages(['unknown']), /不支持/);
});

test('backup allowlist excludes credentials, sync metadata, and debug keys', () => {
  assert.equal(isBackupableLegacyKey('jackyun_schedule_control_v1'), true);
  assert.equal(isBackupableLegacyKey('jackyun-ai-config'), false);
  assert.equal(isBackupableLegacyKey('my_access_token'), false);
  assert.equal(isBackupableLegacyKey('jackyun_backup_local_limit'), false);
  assert.equal(isBackupableLegacyKey('eruda-state'), false);
  assert.equal(isBackupableSettingKey('theme_preference'), true);
  assert.equal(isBackupableSettingKey('ai_config'), false);
});

test('local schedule restore accepts a complete 3.58 MB JSON export', () => {
  const schedule = JSON.stringify({ cues: [{ id: 'cue-1' }], payload: 'x'.repeat(3_580_000) });
  const text = JSON.stringify({ version: 1, page: 'schedule', values: { jackyun_schedule_control_v1: schedule } });
  assert.ok(Buffer.byteLength(text) > 3_500_000);
  assert.equal(parseLocalPageBackup(text, 'schedule').values.jackyun_schedule_control_v1, schedule);
});

test('legacy Schedule JSON merge preserves missing question-bank progress; only explicit deletion removes it', async () => {
  const scheduleKey = 'jackyun_schedule_control_v1';
  const questionsKey = 'jackyun_schedule_questions_v1';
  const questions = JSON.stringify({ questions: [{ id: 'q1' }], attempts: [{ questionId: 'q1', correct: true }], drafts: { session: { index: 2 } } });
  const values = new Map([[scheduleKey, JSON.stringify({ schemaVersion: 1, cues: [{ id: 'cue1' }] })], [questionsKey, questions]]);
  const deleted: string[][] = [];
  const storage = {
    keys: () => [...values.keys()], getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); deleted.push([key]); }, flush: async () => {},
  };
  const recovered: Record<string, string>[] = [];
  const queued: string[][] = [];
  const legacy = parseLocalPageBackup(JSON.stringify({ version: 1, page: 'schedule', values: { [scheduleKey]: JSON.stringify({ schemaVersion: 1, cues: [{ id: 'restored' }] }) } }), 'schedule');
  const changed = await applyLocalPageImport({ page: 'schedule', owner: 'test', ...legacy, storage, saveRecoveryPoint: async (_owner, _page, snapshot) => { recovered.push(snapshot); }, queueV5Targets: async (targets) => { queued.push(targets.map((target) => target.field)); } });
  assert.equal(values.get(questionsKey), questions, 'omitted data from an older JSON is not treated as a delete');
  assert.deepEqual(deleted, []);
  assert.ok(changed.includes(scheduleKey));
  assert.equal(queued.flat().includes('legacyLearning'), false, 'untouched question data is not queued as if it changed');
  assert.equal(recovered[0][questionsKey], questions, 'recovery point preserves answer progress before import');

  const explicit = parseLocalPageBackup(JSON.stringify({ version: 2, page: 'schedule', values: { [scheduleKey]: values.get(scheduleKey) }, deletedKeys: [questionsKey] }), 'schedule');
  await applyLocalPageImport({ page: 'schedule', owner: 'test', ...explicit, storage, saveRecoveryPoint: async () => {}, queueV5Targets: async (targets) => { queued.push(targets.map((target) => target.field)); } });
  assert.equal(values.has(questionsKey), false, 'an explicit delete is applied');
  assert.deepEqual(deleted, [[questionsKey]]);
  assert.ok(queued.at(-1)?.includes('legacyLearning'), 'explicit deletion queues the matching v5 domain');
});
