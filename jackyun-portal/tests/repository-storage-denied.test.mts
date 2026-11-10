import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';

class StorageMock {
  get length() { return 0; }
  key() { return null; }
  getItem() { return null; }
  setItem() {}
  removeItem() {}
  clear() {}
}

Object.assign(globalThis, {
  Storage: StorageMock,
  indexedDB: new IDBFactory(),
  window: {
    get localStorage() { throw new DOMException('Storage access denied', 'SecurityError'); },
    dispatchEvent: () => true,
    addEventListener() {},
    removeEventListener() {},
  },
});

test('repository module remains loadable when browser privacy settings deny localStorage', async () => {
  const { initializeRepository } = await import('../src/lib/sync/repository.ts');
  await initializeRepository(null);
  const {migrateLegacyStorage,workspaceStorage}=await import('../src/lib/sync/repository.ts');
  await assert.rejects(migrateLegacyStorage(),{name:'SecurityError'});
  workspaceStorage.setItem('theme','dark');await workspaceStorage.flush();
  assert.equal(workspaceStorage.getItem('theme'),'dark');
});
