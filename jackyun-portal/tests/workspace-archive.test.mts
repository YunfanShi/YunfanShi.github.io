import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { applyV5WorkspaceArchive, createV5WorkspaceArchive, parseV5WorkspaceArchive } from '../src/lib/backup/workspace-archive.ts';
import { initializeRepository, workspaceStorage } from '../src/lib/sync/repository.ts';

class StorageMock {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
}

Object.assign(globalThis, {
  indexedDB: new IDBFactory(),
  window: { localStorage: new StorageMock(), dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} },
});

test('v5 workspace archive round-trips a Schedule larger than 1 MB and checks record plus archive hashes', async () => {
  const schedule = JSON.stringify({ cues: [{ id: 'cue-a' }], note: '漢字🙂'.repeat(400_000) });
  assert.ok(Buffer.byteLength(schedule) > 1_000_000);
  const archive = await createV5WorkspaceArchive({ jackyun_schedule_control_v1: schedule }, '2026-10-28T12:00:00.000Z');
  const parsed = await parseV5WorkspaceArchive(JSON.stringify(archive));
  assert.equal(parsed.recordCount, 1);
  assert.equal(parsed.records[0].value, schedule);

  const altered = structuredClone(archive);
  altered.records[0].value = `${schedule} `;
  await assert.rejects(parseV5WorkspaceArchive(JSON.stringify(altered)), /记录完整性校验失败/);
  await assert.rejects(parseV5WorkspaceArchive('{"format":"jackyun-v5-workspace","version":5}'), /归档版本或记录数量无效/);
});

test('workspace restore saves page recovery points first, preserves omitted keys, then queues changed v5 resources', async () => {
  indexedDB = new IDBFactory();
  Object.assign(window, { localStorage: new StorageMock() });
  await initializeRepository('archive-owner');
  workspaceStorage.setItem('quizwise_history', JSON.stringify([{ id: 'old' }]));
  workspaceStorage.setItem('jackyun_schedule_control_v1', JSON.stringify({ cues: [{ id: 'cue-old' }] }));
  await workspaceStorage.flush();

  const archive = await createV5WorkspaceArchive({ quizwise_history: JSON.stringify([{ id: 'new' }]) });
  const recoveries: Array<{ page: string; values: Record<string, string> }> = [];
  const events: string[] = [];
  const changed = await applyV5WorkspaceArchive({
    archive,
    owner: 'archive-owner',
    storage: {
      keys: () => Object.keys(workspaceStorage.snapshot()),
      getItem: key => workspaceStorage.getItem(key),
      setItem: (key, value) => workspaceStorage.setItem(key, value),
      flush: async () => { await workspaceStorage.flush(); events.push('flush'); },
    },
    saveRecoveryPoint: async (_owner, page, values) => { recoveries.push({ page, values }); events.push(`recovery:${page}`); },
    queueV5Targets: async targets => { assert.ok(events.includes('flush')); events.push('targets'); assert.ok(targets.some(target => target.field === 'legacyQuiz')); },
  });

  assert.deepEqual(changed, ['quizwise_history']);
  assert.equal(workspaceStorage.getItem('quizwise_history'), JSON.stringify([{ id: 'new' }]));
  assert.equal(workspaceStorage.getItem('jackyun_schedule_control_v1'), JSON.stringify({ cues: [{ id: 'cue-old' }] }));
  assert.ok(recoveries.some(item => item.page === 'quiz' && item.values.quizwise_history === JSON.stringify([{ id: 'old' }])));
  assert.ok(events.indexOf('recovery:quiz') < events.indexOf('flush'));
  assert.ok(events.indexOf('flush') < events.indexOf('targets'));
});

test('failed workspace IndexedDB flush never queues remote restore targets and leaves a recovery point', async () => {
  indexedDB = new IDBFactory();
  Object.assign(window, { localStorage: new StorageMock() });
  await initializeRepository('archive-failure-owner');
  workspaceStorage.setItem('quizwise_history', JSON.stringify([{ id: 'before' }]));
  await workspaceStorage.flush();
  const archive = await createV5WorkspaceArchive({ quizwise_history: JSON.stringify([{ id: 'after' }]) });
  const recoveries: string[] = [];
  let queued = false;
  const originalFlush = workspaceStorage.flush.bind(workspaceStorage);
  workspaceStorage.flush = async () => { throw new Error('injected archive persistence failure'); };
  try {
    await assert.rejects(applyV5WorkspaceArchive({
      archive,
      owner: 'archive-failure-owner',
      storage: {
        keys: () => Object.keys(workspaceStorage.snapshot()),
        getItem: key => workspaceStorage.getItem(key),
        setItem: (key, value) => workspaceStorage.setItem(key, value),
        flush: () => workspaceStorage.flush(),
      },
      saveRecoveryPoint: async (_owner, page) => { recoveries.push(page); },
      queueV5Targets: async () => { queued = true; },
    }), /injected archive persistence failure/);
  } finally {
    workspaceStorage.flush = originalFlush;
  }
  assert.ok(recoveries.includes('quiz'));
  assert.equal(queued, false);
});

test('v5 workspace archive rejects an empty Schedule instead of replacing local data', async () => {
  const archive = await createV5WorkspaceArchive({ jackyun_schedule_control_v1: JSON.stringify({ cues: [] }) });
  await assert.rejects(parseV5WorkspaceArchive(JSON.stringify(archive)), /拒绝从空 Schedule 归档覆盖本机数据/);
});
