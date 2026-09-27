import assert from 'node:assert/strict';
import test from 'node:test';
import { createIdleController } from '../src/lib/workspace-idle.ts';
import { createSyncRunGate } from '../src/lib/sync/run-gate.ts';

test('30 minutes idle saves once before sleeping and activity wakes once', async () => {
  let time = 0;
  const calls: string[] = [];
  const idle = createIdleController(() => time, async () => { calls.push('save'); }, () => calls.push('sleep'), () => calls.push('wake'));
  time = 30 * 60_000 - 1;
  await idle.check(30);
  assert.deepEqual(calls, []);
  time++;
  await idle.check(30);
  await idle.check(30);
  assert.deepEqual(calls, ['save', 'sleep']);
  idle.activity(); idle.activity();
  assert.deepEqual(calls, ['save', 'sleep', 'wake']);
  time += 29 * 60_000;
  await idle.check(30);
  assert.equal(calls.length, 3);
});

test('activity while saving cancels sleep and duplicate ticks do not save twice', async () => {
  let time = 0;
  let release!: () => void;
  let saves = 0;
  let sleeps = 0;
  const idle = createIdleController(() => time, () => { saves++; return new Promise<void>((resolve) => { release = resolve; }); }, () => sleeps++, () => {});
  time = 30 * 60_000;
  const saving = idle.check(30);
  await idle.check(30);
  idle.activity();
  release(); await saving;
  assert.equal(saves, 1); assert.equal(sleeps, 0);
});

test('disabled idle and failed local save do not sleep', async () => {
  let time = 0;
  let sleeps = 0;
  let saves = 0;
  const idle = createIdleController(() => time, async () => { saves++; throw new Error('disk full'); }, () => sleeps++, () => {});
  time = 60 * 60_000;
  await idle.check(0);
  assert.equal(saves, 0);
  await assert.rejects(idle.check(30), /disk full/);
  await idle.check(30);
  assert.equal(saves, 1); assert.equal(sleeps, 0);
});

test('sleep flush waits for ongoing and queued manual sync', async () => {
  const gate = createSyncRunGate();
  gate.begin(false);
  gate.begin(true);
  let idle = false;
  const wait = gate.waitForIdle().then(() => { idle = true; });
  assert.equal(gate.finish(), true);
  gate.begin(true);
  await Promise.resolve();
  assert.equal(idle, false);
  gate.finish(); await wait;
  assert.equal(idle, true);
});
