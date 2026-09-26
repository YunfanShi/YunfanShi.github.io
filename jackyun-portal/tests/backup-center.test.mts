import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_BACKUP_PAGES, BACKUP_TABLES, isBackupableLegacyKey, isBackupableSettingKey, legacyBackupPage, normalizeBackupPages, tableBackupPage } from '../src/lib/backup/pages.ts';
import { getLocalBackupLimit } from '../src/lib/backup/local.ts';

test('local backup retention stays at ten even with an older preference', () => {
  const previous = globalThis.localStorage;
  const values = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } as Storage;
  try {
    assert.equal(getLocalBackupLimit(), 10);
    values.set('jackyun_backup_local_limit', '20');
    assert.equal(getLocalBackupLimit(), 10);
  } finally {
    globalThis.localStorage = previous;
  }
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
