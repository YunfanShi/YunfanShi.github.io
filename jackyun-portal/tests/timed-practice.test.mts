import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEmptyScheduleState, cuesForLearningTask, tasksForDate } from '../src/lib/learning/schedule-control.ts';
import { normalizeTimedPractice, planTimedPractice, practiceWeek, weeklyPracticeSubjects, weeklyPracticeSummary, type TimedPracticeRecord } from '../src/lib/learning/timed-practice.ts';
import { readScheduleState } from '../src/lib/learning/workspace-reader.ts';
import { scheduleHasContent, unsafeScheduleReplacement } from '../src/lib/sync/schedule-safety.ts';
import { threeWayMerge } from '../src/lib/sync/merge.ts';

const record = (overrides: Partial<TimedPracticeRecord> = {}): TimedPracticeRecord => ({ id: 'first', date: '2026-10-13', subject: 'Pure Math', source: 'B', reference: 'New Q1–4', independent: true, minutes: 25, onTime: 2, overtime: 1, failed: 1, blocked: 1, bottleneck: '受力分析', ...overrides });

test('week boundaries include Sunday, cross years and rotate subjects deterministically', () => {
  assert.deepEqual(practiceWeek('2026-10-18'), { start: '2026-10-12', end: '2026-10-18' });
  assert.deepEqual(practiceWeek('2027-01-01'), { start: '2026-12-28', end: '2027-01-03' });
  assert.equal(weeklyPracticeSubjects('2026-10-13')[3], 'Statistics');
  assert.equal(weeklyPracticeSubjects('2026-10-20')[3], 'Computer Science');
});
test('first-attempt metrics include failed attempts but exclude familiar repair, mocks, assisted and other weeks', () => {
  const records = [record({ failedOvertime: 1 }), record({ id: 'hw', source: 'homework', subject: 'Physics', onTime: 0, overtime: 0, failed: 2, blocked: 0 }),
    ...(['A', 'C'] as const).map(source => record({ id: source, source, onTime: 100 })),
    record({ id: 'help', independent: false }), record({ id: 'old', date: '2026-10-11' })];
  const summary = weeklyPracticeSummary(records, '2026-10-13');
  assert.equal(summary.attempted, 6); assert.equal(summary.onTimeRate, 33);
  assert.equal(summary.overtime, 2); assert.equal(summary.blocked, 1);
  assert.deepEqual([...summary.creditedSubjects], ['Pure Math', 'Physics']);
  assert.deepEqual(summary.bottlenecks, ['受力分析']);
  assert.equal(weeklyPracticeSummary([], '2026-10-13').onTimeRate, null);
  assert.equal(weeklyPracticeSummary([record({ minutes: 19 })], '2026-10-13').creditedSubjects.size, 0);
});
test('invalid results and duplicate IDs cannot corrupt persisted evidence', () => {
  const bad = [null, {}, record({ failedOvertime: 2 }), record({ blocked: 2 }), record({ minutes: -1 }), record({ date: '2026-02-31' }), record({ onTime: .5 }), record({ onTime: 0, overtime: 0, failed: 0, blocked: 0 })];
  assert.deepEqual(normalizeTimedPractice(bad), []);
  assert.equal(normalizeTimedPractice([record(), record()]).length, 1);
});
test('planning deduplicates and reopens cancelled work; homework credit and ticks are distinct', () => {
  const empty = createEmptyScheduleState();
  const planned = planTimedPractice(empty, 'Pure Math', '2026-10-13', 'task');
  assert.equal(planned.manualTasks.length, 1);
  const task = tasksForDate(planned, new Date('2026-10-13T12:00:00'))[0];
  assert.deepEqual(task.cueIds, []);
  assert.deepEqual(cuesForLearningTask([], task), []);
  assert.equal(planTimedPractice(planned, 'Pure Math', '2026-10-14', 'duplicate'), planned);
  assert.equal(planTimedPractice({ ...planned, cancellations: { task: { cancelledAt: '2026-10-13' } } }, 'Pure Math', '2026-10-14', 'replacement').manualTasks.length, 2);
  assert.equal(weeklyPracticeSummary([], '2026-10-13').creditedSubjects.size, 0);
  const credited = { ...empty, timedPracticeRecords: [record({ source: 'homework' })] };
  assert.equal(planTimedPractice(credited, 'Pure Math', '2026-10-13', 'redundant'), credited);
  assert.equal(planTimedPractice(planned, 'Pure Math', '2026-10-20', 'next-week').manualTasks.length, 2);
});
test('old data loads, new evidence survives reload and protects cloud replacement', () => {
  const old = createEmptyScheduleState(); delete old.timedPracticeRecords;
  assert.deepEqual(readScheduleState({ getItem: () => JSON.stringify(old) }).timedPracticeRecords, []);
  const saved = { ...old, timedPracticeRecords: [record()] };
  const loaded = readScheduleState({ getItem: () => JSON.stringify(saved) }, new Date('2026-10-13T12:00:00'));
  assert.deepEqual(loaded.timedPracticeRecords, [record()]);
  assert.equal(scheduleHasContent(saved), true);
  assert.equal(unsafeScheduleReplacement(saved, old), true);
  const merged = threeWayMerge({ ...old, timedPracticeRecords: [] }, saved, { ...old, timedPracticeRecords: [record({ id: 'remote' })] });
  assert.deepEqual(merged.conflicts, []);
  assert.equal((merged.merged as typeof saved).timedPracticeRecords.length, 2);
});
