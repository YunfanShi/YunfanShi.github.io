import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';

const values = new Map<string, string>();
class StorageMock {
  get length() { return values.size; }
  key(index: number) { return [...values.keys()][index] ?? null; }
  getItem(key: string) { return values.get(key) ?? null; }
  setItem(key: string, value: string) { values.set(String(key), String(value)); }
  removeItem(key: string) { values.delete(String(key)); }
  clear() { values.clear(); }
}

const localStorage = new StorageMock();
values.set('jackyun_theme', 'dark');
values.set('jackyun_schedule_control_v1', JSON.stringify({ cues: [{ id: 'legacy-cue' }] }));
Object.assign(globalThis, {
  indexedDB: new IDBFactory(),
  Storage: StorageMock,
  BroadcastChannel: undefined,
  window: {
    localStorage,
    dispatchEvent: () => true,
    addEventListener() {},
    removeEventListener() {},
  },
});

const { initializeRepository, workspaceStorage } = await import('../src/lib/sync/repository.ts');
const { getDocuments } = await import('../src/lib/sync/outbox.ts');
const { readLocalData } = await import('../src/lib/sync/local-data.ts');
localStorage.setItem('jackyun_theme', 'light');
const localOnlyValues = {
  'jackyun_cue_answer_draft_v1:["session","cue"]': '{"text":"old draft"}',
  'jackyun_sync_pause_until_v1:test-user': '2000000000000',
  'jackyun_stepwise_recitations_v1': '[{"id":"legacy-recitation"}]',
};
for (const [key, value] of Object.entries(localOnlyValues)) values.set(key, value);

test('legacy localStorage API reads and writes durable application data through IndexedDB', async () => {
  await initializeRepository('storage-shim-test');

  assert.equal(localStorage.getItem('jackyun_theme'), 'light');
  assert.equal(values.has('jackyun_theme'), false, 'legacy theme is removed only after its IndexedDB copy verifies');
  for (const [key, value] of Object.entries(localOnlyValues)) {
    assert.equal(localStorage.getItem(key), value, `${key} remains readable through the old API`);
    assert.equal(values.has(key), false, `${key} is removed only after its local IndexedDB copy verifies`);
  }
  const localRows = new Map((await readLocalData()).map((row) => [row.key, row.value]));
  for (const [key, value] of Object.entries(localOnlyValues)) assert.equal(localRows.get(key), value, `${key} is kept in the local-only IndexedDB store`);
  assert([...localRows.values()].some((value) => value.includes('"sourceKey":"jackyun_theme"') && value.includes('"value":"dark"')), 'native legacy theme is preserved when a newer startup write exists');

  const largeSchedule = JSON.stringify({ cues: [{ id: 'restored-cue', body: 'x'.repeat(1_500_000) }] });
  localStorage.setItem('jackyun_schedule_control_v1', largeSchedule);
  await workspaceStorage.flush();

  assert.equal(values.has('jackyun_schedule_control_v1'), false, 'old API writes do not recreate a localStorage quota copy');
  assert.equal(localStorage.getItem('jackyun_schedule_control_v1'), largeSchedule);
  assert.equal((await getDocuments()).find((row) => row.key === 'jackyun_schedule_control_v1')?.value, largeSchedule);

  localStorage.setItem('sb-project-auth-token', 'session-token');
  assert.equal(values.get('sb-project-auth-token'), 'session-token', 'authentication state remains in native browser storage');
});
