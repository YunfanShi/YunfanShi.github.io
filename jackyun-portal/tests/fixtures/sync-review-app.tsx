// Loopback browser harness: real sync UI, coordinator, IndexedDB and merge engine.
// Authentication and the cloud transport are explicit local test fixtures.
import {createRoot} from 'react-dom/client';
import SyncCenterPanel from '../../src/components/settings/sync-center-panel';
import LocalWorkspaceSync from '../../src/components/layout/local-workspace-sync';
import * as store from '../../src/lib/sync/outbox';

async function start() {
  const fixture=await (await fetch('/_fixture')).json();
  await store.bindSyncUser('browser-review-fixture');
  if(!await store.getSetting('fixtureInitialized')) {
    localStorage.setItem(fixture.key,JSON.stringify(fixture.local));
    await store.saveMetadata(fixture.base);
    await store.queueOperation(fixture.operation);
    await store.saveConflict(fixture.conflict);
    await store.setSetting('fixtureInitialized',true);
  }
  createRoot(document.getElementById('root')!).render(<><LocalWorkspaceSync userId="browser-review-fixture"/><SyncCenterPanel/></>);
}
void start();
