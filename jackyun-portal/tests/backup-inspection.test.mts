import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectCloudBackup, inspectScheduleVersion } from '../src/lib/backup/inspection.ts';

test('Schedule version comparison exposes missing and changed Cue content without storage keys', () => {
  const saved = { cues: [{ id: 'kept', prompt: 'Old prompt' }, { id: 'lost', prompt: 'Lost Cue' }], manualTasks: [{ id: 'task', title: 'Homework' }], learningRecords: [] };
  const current = { cues: [{ id: 'kept', prompt: 'New prompt' }, { id: 'added', prompt: 'Added Cue' }], manualTasks: [], learningRecords: [] };
  const inspected = inspectScheduleVersion(saved, current);
  assert.deepEqual(inspected.facts, ['Cue 2 条', '手动任务 1 条', '学习记录 0 条']);
  assert.match(inspected.comparison.join(' '), /这个版本独有 1、当前独有 1、内容不同 1/);
  assert.match(inspected.comparison.join(' '), /Lost Cue/);

  const cloud = inspectCloudBackup('schedule', { legacy_sync_data: [
    { storage_key: 'jackyun_schedule_control_v1', storage_value: saved },
    { storage_key: 'jack_timetable_plan', storage_value: {} },
  ] }, current);
  assert.match(cloud.facts.join(' '), /课表计划 1 份/);
  assert.doesNotMatch([...cloud.facts, ...cloud.comparison].join(' '), /legacy_sync_data|jack_timetable_plan/);
});
