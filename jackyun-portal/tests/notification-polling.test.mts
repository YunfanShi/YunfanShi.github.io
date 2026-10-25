/* eslint-disable @typescript-eslint/no-explicit-any -- VM fixtures expose dynamically evaluated browser globals. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as domain from '../src/lib/notification-snapshot.ts';
import { isSyncableStorageKey } from '../src/lib/local-workspace.ts';

const flush = async () => { for (let i=0;i<5;i++) await new Promise(resolve => setImmediate(resolve)); };
function harness() {
  let now = 1_000_000, calls = 0, blocked = false;
  let release: (()=>void) | undefined;
  const shared = new Map<string,string>();
  const channels = new Set<{ name: string; onmessage?: (event: unknown)=>void }>();
  const localStorage = { getItem: (key:string)=>shared.get(key)??null, setItem:(key:string,value:string)=>shared.set(key,value), removeItem:(key:string)=>shared.delete(key) };
  const lockNames = new Set<string>();
  const tabs: Array<{ document: { visibilityState: string }; navigator: { onLine: boolean }; callbacks: Array<()=>void>; store: any; stop: ()=>void }> = [];
  function tab(userId='alice') {
    const callbacks: Array<()=>void> = [];
    const document = { visibilityState:'visible', addEventListener:()=>{}, removeEventListener:()=>{} };
    const navigator = { onLine:true, locks:{ request: async(name:string,_options:unknown,task:(lock:unknown)=>Promise<void>) => {
      if(lockNames.has(name)) return task(null);
      lockNames.add(name); try { await task({name}); } finally { lockNames.delete(name); }
    } } };
    class Channel {
      onmessage?: (event:unknown)=>void;
      name: string;
      constructor(name:string) { this.name=name; channels.add(this); }
      postMessage(data:unknown) { for(const channel of channels) if(channel!==this && channel.name===this.name) channel.onmessage?.({data}); }
      close(){channels.delete(this);}
    }
    const exports: Record<string,any> = {};
    const source = readFileSync(new URL('../src/lib/notification-client.ts',import.meta.url),'utf8');
    const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
    const date = class extends Date { static now(){return now;} };
    runInNewContext(compiled+'\nexports.TestStore=NotificationStore;', {
      exports, require:(name:string)=>name==='react'?{}:name==='@/lib/sync/repository'?{workspaceStorage:localStorage}:domain,
      window:{addEventListener:()=>{},removeEventListener:()=>{}},document,navigator,localStorage,
      BroadcastChannel:Channel, Date:date, AbortController, performance, console:{debug:()=>{}}, crypto:{randomUUID:()=>Math.random().toString()},
      setInterval:(task:()=>void)=>{callbacks.push(task);return callbacks.length;},clearInterval:()=>{},
      setTimeout:()=>1,clearTimeout:()=>{},
      fetch:async()=>{calls++;if(blocked)await new Promise<void>(resolve=>{release=resolve;});return {ok:true,status:200,headers:{get:()=> 'test-request'},json:async()=>({userId,items:[{id:'message',recipient_user_id:userId}],unreadCount:1,hasMore:false,nextOffset:100})};},
    });
    const store = new exports.TestStore(userId);
    const stop=store.subscribe(()=>{});
    const result={document,navigator,callbacks,store,stop};tabs.push(result);return result;
  }
  return {tab,tabs,shared,get calls(){return calls;},set blocked(value:boolean){blocked=value;},release:()=>release?.(),advance:(ms:number)=>{now+=ms;for(const tab of tabs)for(const callback of tab.callbacks)callback();}};
}

test('four foreground tabs share at most 61 snapshots in one idle hour',async()=>{
  const h=harness();for(let i=0;i<4;i++){h.tab();await flush();}
  for(let elapsed=5000;elapsed<=3_600_000;elapsed+=5000){h.advance(5000);await flush();}
  assert.equal(h.calls,61);
  assert.ok([...h.shared.keys()].length>0);
  for(const key of h.shared.keys())assert.equal(isSyncableStorageKey(key),false,'coordination metadata must never trigger cloud sync');
  for(const tab of h.tabs){assert.equal(tab.store.getSnapshot().items.length,1);tab.stop();}
});
test('hidden/offline clients pause; recovery and focus storms cannot overlap requests',async()=>{
  const h=harness(),tab=h.tab();await flush();
  tab.document.visibilityState='hidden';h.advance(180000);await flush();assert.equal(h.calls,1);
  tab.document.visibilityState='visible';tab.navigator.onLine=false;h.advance(180000);await flush();assert.equal(h.calls,1);
  tab.navigator.onLine=true;h.blocked=true;void tab.store.refresh('resume');await flush();
  for(let i=0;i<30;i++)void tab.store.refresh('resume');
  h.advance(120000);await flush();assert.equal(h.calls,2);
  h.release();await flush();tab.stop();
});
test('another account cannot receive shared notification content; logout removes cached content',async()=>{
  const h=harness(),a=h.tab('alice');await flush();const b=h.tab('bob');await flush();
  assert.equal(a.store.getSnapshot().items[0].recipient_user_id,'alice');
  assert.equal(b.store.getSnapshot().items[0].recipient_user_id,'bob');
  a.stop();assert.equal(a.store.getSnapshot().items.length,0);b.stop();
});
