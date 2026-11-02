import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEDULE_STORAGE_KEY } from '../src/lib/sync/schedule-safety.ts';
import { createScheduleDataBlockBundle, parseScheduleDataBlockBundle, readScheduleDataBlock, scheduleDataBlockReplacement } from '../src/lib/backup/schedule-blocks.ts';

test('a CUE block export carries dates and only the selected records', () => {
  const snapshot = { [SCHEDULE_STORAGE_KEY]: JSON.stringify({ cues: [{ id: 'cue-1', prompt: 'Steps', updatedAt: '2026-10-01T00:00:00.000Z' }], learningRecords: [{ id: 'record-1' }] }) };
  const bundle = createScheduleDataBlockBundle('cues', snapshot, '2026-11-02T00:00:00.000Z');
  assert.equal(bundle.count, 1);
  assert.equal(bundle.exportedAt, '2026-11-02T00:00:00.000Z');
  assert.equal(bundle.dataUpdatedAt, '2026-10-01T00:00:00.000Z');
  assert.deepEqual(readScheduleDataBlock('learningRecords', snapshot), [{ id: 'record-1' }]);
});

test('import replaces only the selected block and rejects cross-block files', () => {
  const current = { [SCHEDULE_STORAGE_KEY]: JSON.stringify({ cues: [{ id: 'old' }], learningRecords: [{ id: 'keep' }] }) };
  const bundle = parseScheduleDataBlockBundle(JSON.stringify({ format: 'jackyun-schedule-data-block', version: 1, block: 'cues', exportedAt: '', dataUpdatedAt: null, count: 1, data: [{ id: 'new' }] }), 'cues');
  const replacement = scheduleDataBlockReplacement(bundle, current);
  const result = JSON.parse(replacement.value);
  assert.deepEqual(result.cues, [{ id: 'new' }]);
  assert.deepEqual(result.learningRecords, [{ id: 'keep' }]);
  assert.throws(() => parseScheduleDataBlockBundle(JSON.stringify({ ...bundle, block: 'learningRecords' }), 'cues'), /不一致/);
});
