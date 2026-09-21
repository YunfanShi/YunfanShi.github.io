import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSleepPlans } from '../src/lib/sleep-calculator.ts';

test('calculates bedtimes from wake time, sleep cycles, and sleep latency', () => {
  const plans = calculateSleepPlans('07:00', 15);

  assert.deepEqual(plans.map((plan) => ({ cycles: plan.cycles, bedtime: plan.bedtime, asleepAt: plan.asleepAt })), [
    { cycles: 6, bedtime: '21:45', asleepAt: '22:00' },
    { cycles: 5, bedtime: '23:15', asleepAt: '23:30' },
    { cycles: 4, bedtime: '00:45', asleepAt: '01:00' },
  ]);
});

test('wraps calculations across midnight and clamps invalid latency ranges', () => {
  assert.equal(calculateSleepPlans('05:30', 999, [5])[0].bedtime, '20:00');
  assert.equal(calculateSleepPlans('00:30', -10, [4])[0].bedtime, '18:30');
});

test('rejects invalid clock values', () => {
  assert.throws(() => calculateSleepPlans('25:00', 15), /valid clock range/);
  assert.throws(() => calculateSleepPlans('7:00', 15), /HH:mm/);
});

