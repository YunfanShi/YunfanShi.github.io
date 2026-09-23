import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIeltsInsights, parseIeltsGoal, parseIeltsPractices, planIeltsWeek, validDate, type IeltsGoal, type IeltsPractice } from '../src/lib/ielts-plan.ts';

const goal: IeltsGoal = { overall: 7, examDate: '2026-12-01', weeklyHours: 5, targets: { listening: 7, reading: 7, writing: 7, speaking: 7 } };

test('validates stored goals and calendar dates before using them', () => {
  assert.equal(validDate('2026-02-29'), false);
  assert.deepEqual(parseIeltsGoal(goal), goal);
  assert.equal(parseIeltsGoal({ ...goal, targets: { ...goal.targets, writing: 9.3 } }), null);
  assert.equal(parseIeltsGoal({ ...goal, weeklyHours: 0 }), null);
});

test('rejects malformed practice data and keeps an unscored practice', () => {
  const practice: IeltsPractice = { id: 'one', skill: 'reading', practicedAt: '2026-09-20T10:00:00Z', minutes: 45, band: null, outcome: 'partial', material: 'Test 1', issue: '定位慢', nextStep: '换题验证' };
  assert.deepEqual(parseIeltsPractices([practice, { ...practice, band: 10 }, { ...practice, minutes: -1 }]), [practice]);
});

test('prioritizes measured target gaps while treating activity as non-scoring evidence', () => {
  const practices: IeltsPractice[] = [
    { id: 'l', skill: 'listening', practicedAt: '2026-09-23T10:00:00Z', minutes: 40, band: 7, outcome: 'stable', material: 'Test 1', issue: '', nextStep: '换题' },
    { id: 'w', skill: 'writing', practicedAt: '2026-09-23T10:00:00Z', minutes: 60, band: 5.5, outcome: 'unclear', material: 'Task 2', issue: '论证不足', nextStep: '换题' },
  ];
  const insights = buildIeltsInsights(goal, practices, [{ skill: 'reading', practicedAt: '2026-09-23T12:00:00Z', source: '阅读器' }], '2026-09-24');
  assert.equal(insights[0].skill, 'writing');
  assert.equal(insights.find((item) => item.skill === 'reading')?.latestBand, null);
  assert.equal(insights.find((item) => item.skill === 'reading')?.latestAt, '2026-09-23T12:00:00Z');
  assert.equal(insights.find((item) => item.skill === 'writing')?.issue, '论证不足');
});

test('weekly suggestion respects limited time and never assigns more than 60 minutes per skill', () => {
  const insights = buildIeltsInsights(goal, [], [], '2026-09-24');
  assert.deepEqual(planIeltsWeek(1, insights), { sessions: [{ skill: 'listening', minutes: 45 }], reviewMinutes: 15 });
  const full = planIeltsWeek(5, insights);
  assert.equal(full.sessions.length, 4);
  assert.ok(full.sessions.every((session) => session.minutes <= 60));
  assert.ok(full.sessions.reduce((sum, session) => sum + session.minutes, full.reviewMinutes) <= 300);
});
