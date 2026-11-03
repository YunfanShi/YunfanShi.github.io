import assert from 'node:assert/strict';
import test from 'node:test';
import { acquirePageTabLock } from '../src/lib/page-tab-lock.ts';
import { navigationIdFromPath } from '../src/lib/navigation.ts';

test('a second tab cannot acquire the same page while another page remains available', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const held = new Set<string>();
  const locks = {
    request(name: string, _options: unknown, callback: (lock: { name: string } | null) => Promise<void> | void) {
      if (held.has(name)) return Promise.resolve(callback(null));
      held.add(name);
      return Promise.resolve(callback({ name })).finally(() => held.delete(name));
    },
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
  try {
    const schedule = navigationIdFromPath('/schedule');
    const settings = navigationIdFromPath('/settings');
    assert.equal(schedule, 'schedule');
    assert.equal(settings, 'settings');
    const first = await acquirePageTabLock(schedule!);
    assert.equal(first.acquired, true);
    assert.deepEqual(await acquirePageTabLock(schedule!), { acquired: false }, 'the same page is exclusive across tabs');
    const other = await acquirePageTabLock(settings!);
    assert.equal(other.acquired, true, 'a different page may remain open in parallel');
    first.release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const retried = await acquirePageTabLock(schedule!);
    assert.equal(retried.acquired, true, 'closing the first page makes it available again');
    other.release();
    retried.release();
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete (globalThis as typeof globalThis & { navigator?: Navigator }).navigator;
  }
});
