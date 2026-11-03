import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {initializeRepository,workspaceStorage} from '../src/lib/sync/repository.ts';
import {getDocuments,getOutbox} from '../src/lib/sync/outbox.ts';
import {isSyncableStorageKey} from '../src/lib/local-workspace.ts';
import {legacyWorkspaceRecordId} from '../src/lib/sync/resource-model.ts';
import {readLocalData} from '../src/lib/sync/local-data.ts';

const values=new Map<string,string>();
class StorageMock {
  get length(){return values.size;}
  key(index:number){return [...values.keys()][index]??null;}
  getItem(key:string){return values.get(key)??null;}
  setItem(key:string,value:string){values.set(key,String(value));}
  removeItem(key:string){values.delete(key);}
  clear(){values.clear();}
}
Object.assign(globalThis,{indexedDB:new IDBFactory(),Storage:StorageMock,BroadcastChannel:undefined,window:{localStorage:new StorageMock(),dispatchEvent:()=>true,addEventListener(){},removeEventListener(){}}});

test('navigation analytics stays local and cannot block durable learning writes',async()=>{
  const key='jackyun_nav_usage_queue_v2';
  assert.equal(isSyncableStorageKey('jackyun-continue-pref-test'),false);
  values.set('jackyun-continue-pref-test','{"theme":"dark"}');
  assert.equal(isSyncableStorageKey(key),false);
  assert.equal(legacyWorkspaceRecordId(key),null);
  await initializeRepository('navigation-test');
  const oversized='x'.repeat(1_500_000);
  window.localStorage.setItem('jackyun-debug-on-save',oversized);
  await workspaceStorage.flush();
  assert.equal(values.has('jackyun-debug-on-save'),false,'debug snapshots bypass localStorage quota');
  assert.equal(workspaceStorage.getItem('jackyun-debug-on-save'),oversized);
  window.localStorage.setItem('sb-project-auth-token','session');
  assert.equal(values.get('sb-project-auth-token'),'session','Supabase session storage remains native');
  assert.equal((await readLocalData()).find(row=>row.key==='jackyun-continue-pref-test')?.value,'{"theme":"dark"}');
  assert.equal(workspaceStorage.getItem('jackyun-continue-pref-test'),' {"theme":"dark"}'.trim());
  assert.equal(values.has('jackyun-continue-pref-test'),false,'legacy copy is removed only after IndexedDB migration verifies');
  for(let index=0;index<50;index++){
    workspaceStorage.setItem(key,JSON.stringify(['dashboard',`route-${index}`]));
    workspaceStorage.setItem(key,'[]');
  }
  workspaceStorage.setItem('jackyun_ielts_goal_v1',JSON.stringify({target:7}));
  await workspaceStorage.flush();
  assert.equal((await getDocuments()).some(row=>row.key===key),false);
  assert.equal((await getOutbox()).some(row=>row.key===key),false);
  assert.ok((await getOutbox()).some(row=>row.key==='jackyun_ielts_goal_v1'));
  assert.equal(values.has(key),false,'long-lived local-only data is not mirrored to localStorage');
  assert.equal((await readLocalData()).find(row=>row.key===key)?.value,'[]');
});

test('old analytics records stay compatible while the sidebar only writes the local queue',()=>{
  assert.equal(isSyncableStorageKey('jackyun_nav_usage_pending'),true);
  const source=readFileSync(new URL('../src/components/layout/sidebar.tsx',import.meta.url),'utf8');
  assert.match(source,/PENDING_USAGE_KEY = 'jackyun_nav_usage_queue_v2'/);
  assert.doesNotMatch(source,/PENDING_USAGE_KEY = 'jackyun_nav_usage_pending'/);
});

test('the floating recovery notice is no longer mounted and the status control stays compact',()=>{
  const workspace=readFileSync(new URL('../src/components/layout/local-workspace-sync.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(workspace,/<LocalDurabilityNotice/);
  const status=readFileSync(new URL('../src/components/layout/sync-status-indicator.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(status,/本机保存未完成|animate-spin/);
  assert.match(status,/data-sync-attention/);
  assert.match(status,/保留当前页面并在同步中心检查/);
});
