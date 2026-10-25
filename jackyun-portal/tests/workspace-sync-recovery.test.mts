/* eslint-disable @typescript-eslint/no-explicit-any -- VM fixture modules use dynamic exports; production sync retains strict types. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID, createHash, webcrypto } from 'node:crypto';
import {createWorkspaceSync} from '../src/lib/sync/engine.ts';
import {applyRecordDelta} from '../src/lib/sync/delta.ts';
import ts from 'typescript';
import { reconcileAcknowledgment, operationMatchesStorage } from '../src/lib/sync/acknowledgment.ts';
import { createSyncRunGate } from '../src/lib/sync/run-gate.ts';
import { canonicalJson } from '../src/lib/sync/hash.ts';
import { buildSyncRequest, compactSyncOperations } from '../src/lib/sync/batch.ts';
import { syncRetryDelay, shouldPauseSync } from '../src/lib/sync/retry-policy.ts';
import type { SyncOperation, SyncRecord } from '../src/types/sync.ts';

const digest=(value:unknown,deleted=false)=>createHash('sha256').update(deleted?'__deleted__':canonicalJson(value)).digest('hex');
const sent: SyncOperation = { id: 'op', key: 'study', value: { text: 'old' }, deleted: false,
  baseRevision: 1, baseHash: 'base', baseValue: { text: 'base' }, clientUpdatedAt: '2026-10-10T00:00:00Z' };
const cloud: SyncRecord = { key: sent.key, value: sent.value, revision: 2, contentHash: 'cloud', deleted: false, updatedAt: sent.clientUpdatedAt };

test('acknowledgment retains a newer edit compacted into the uploaded ID and rebases its retry', () => {
  const newer = { ...sent, value: { text: 'new' }, clientUpdatedAt: '2026-10-10T00:01:00Z' };
  const retry = reconcileAcknowledgment(newer, sent, cloud, 'new-id');
  assert.deepEqual(retry, { ...newer, id: 'new-id', baseRevision: 2, baseHash: 'cloud', baseValue: cloud.value, baseDeleted:false,resolvesOperationId: undefined });
  assert.equal(reconcileAcknowledgment(sent, { ...sent, baseValue: null }, cloud, 'unused'), null);
  assert.equal(reconcileAcknowledgment({ ...newer, deleted: true, value: null }, sent, cloud, 'delete')?.deleted, true);
});

test('in-flight edits and deletions never match an older upload, including JSON null and plain text', () => {
  assert.equal(operationMatchesStorage(sent, '{"text":"old"}'), true);
  assert.equal(operationMatchesStorage(sent, '{"text":"new"}'), false);
  assert.equal(operationMatchesStorage(sent, null), false);
  assert.equal(operationMatchesStorage({ ...sent, value: null }, 'null'), true);
  assert.equal(operationMatchesStorage({ ...sent, value: 'hello' }, 'hello'), true);
  assert.equal(operationMatchesStorage({ ...sent, deleted: true }, null), true);
  assert.equal(operationMatchesStorage({ ...sent, deleted: true }, 'new'), false);
});

const settle = async () => { await new Promise(resolve=>setTimeout(resolve,15));for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const compiled = ts.transpileModule(readFileSync(new URL('../src/components/layout/local-workspace-sync.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX },
}).outputText;

function harness() {
  let now = 1_000_000, blocked = false, conflict = false, fail = false;
  let cloudRecords: SyncRecord[] = [];
  let release: (() => void) | undefined;
  const values = new Map<string, string>(), settings = new Map<string, unknown>();
  const metadata = new Map<string, SyncRecord>();
  let outbox: SyncOperation[] = [];let conflicts:any[]=[];let sequence=0;
  const requests: { method: string; url: string; body?: { operations: SyncOperation[] } }[] = [];
  const locks = new Set<string>();
  const tabs: { win: EventTarget; doc: EventTarget & { visibilityState: string }; nav: { onLine: boolean }; ticks: (() => void)[]; stop: () => void; status: any }[] = [];
  const storage = { get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
  const outboxApi = {
    getSubmission:async()=>settings.get('syncSubmission')??null,saveSubmission:async(value:unknown)=>{settings.set('syncSubmission',value);},
    getDownloadParts:async()=>[],saveDownloadPart:async()=>{},clearDownload:async()=>{},
    bindSyncUser: async () => {}, clearConflicts: async () => {}, getOrCreateDeviceId: async () => 'device',
    getSetting: async (key: string) => settings.get(key) ?? null,
    setSetting: async (key: string, value: unknown) => { settings.set(key, value); },
    getMetadata: async () => [...metadata.values()], saveMetadata: async (record: SyncRecord) => { metadata.set(record.key, record); },
    getOutbox: async () => [...outbox], compactOutbox: async () => (outbox = compactSyncOperations(outbox)),
    queueOperation: async (operation: SyncOperation) => { outbox = compactSyncOperations([...outbox, {...operation,sequence:++sequence}]); },
    getConflicts:async()=>[...conflicts],saveConflict:async(value:any)=>{conflicts=conflicts.filter(c=>c.operationId!==value.operationId).concat(value);},removeConflict:async(id:string)=>{conflicts=conflicts.filter(c=>c.operationId!==id);},
    replaceOperation:async(sent:SyncOperation,next:SyncOperation|null)=>{const current=outbox.find(op=>op.id===sent.id);if(!current||canonicalJson(current)!==canonicalJson(sent))return false;outbox=outbox.filter(op=>op.id!==sent.id).concat(next?[next]:[]);return true;},
    removeOperation: async (id: string) => { outbox = outbox.filter(item => item.id !== id); },
    acknowledgeOperation: async (operation: SyncOperation, record: SyncRecord, resolves?: string) => {
      const current = outbox.find(item => item.id === operation.id)??outbox.find(item=>item.key===operation.key&&item.baseRevision===operation.baseRevision&&item.baseHash===operation.baseHash);
      if (!current) return false;
      const replacement = reconcileAcknowledgment(current, operation, record, randomUUID(), resolves);
      outbox = outbox.filter(item => item.id !== current.id);
      if (replacement) outbox.push(replacement);
      return !replacement;
    },
  };
  function tab() {
    const ticks: (() => void)[] = [], effects: (() => (() => void) | undefined)[] = [];
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const win = Object.assign(new EventTarget(), { setInterval: (task: () => void) => { ticks.push(task); return ticks.length; },
      clearInterval: () => {}, setTimeout: () => 1, clearTimeout: () => {}, matchMedia: () => ({ matches: false }) });
    const nav = { onLine: true, userAgent: 'test', locks: { request: async (name: string, _options: unknown, task: (lock: unknown) => Promise<void>) => {
      if (locks.has(name)) return task(null);
      locks.add(name); try { await task({ name }); } finally { locks.delete(name); }
    } } };
    const result = { win, doc, nav, ticks, stop: () => {}, status: null as any };
    const exports: Record<string, any> = {};
    const modules: Record<string, unknown> = {
      'react/jsx-runtime':{jsx:()=>null},'./local-durability':{default:()=>null},
      '@/lib/sync/repository':{workspaceStorage:storage,initializeRepository:async()=>{},flushLocalWrites:async()=>{},applyRepositoryRecord:async(key:string,value:string|null)=>{if(value===null)storage.removeItem(key);else storage.setItem(key,value);}},
      '@/lib/sync/scheduler':{runScheduledSync:async(lane:string,userId:string,work:()=>Promise<void>)=>nav.locks.request('shared:'+lane+userId,{},async lock=>{if(lock)await work();}),createEditTrigger:()=>({trigger:()=>{},dispose:()=>{}})},
      react: { useEffect: (effect: () => (() => void) | undefined) => effects.push(effect) },
      '@/lib/sync/engine':{createWorkspaceSync},
      '@/lib/backup/pages':{isBackupableLegacyKey:()=>true,legacyBackupPage:()=> 'study'},
      '@/lib/backup/local':{localPageValues:(values:unknown)=>values,saveLocalBackup:async()=>{}},
      '@/lib/sync/run-gate': { createSyncRunGate }, '@/lib/sync/retry-policy': { syncRetryDelay, shouldPauseSync },
      '@/lib/sync/acknowledgment': { reconcileAcknowledgment, operationMatchesStorage }, '@/lib/sync/outbox': {...outboxApi,accountSyncStore:()=>outboxApi},
      '@/lib/sync/hash': { canonicalJson }, '@/lib/sync/batch': { buildSyncRequest, MAX_SYNC_BATCH_BYTES: 250_000 },
      '@/lib/sync/status': { announceSyncStatus: (detail: unknown) => { result.status = detail; }, getLatestSyncStatus: () => result.status },
      '@/lib/local-workspace': { isSyncableStorageKey: (key: string) => key === 'study', MAX_SYNC_VALUE_CHARACTERS: 400_000,
        syncValueFits: () => true, storageValueToString: JSON.stringify, CLOUD_STATE_APPLIED_EVENT: 'cloud-applied' },
      '@/lib/workspace-idle': { isWorkspaceSleeping: () => false, BEFORE_SLEEP_EVENT: 'sleep', WAKE_EVENT: 'wake' },
      '@/lib/sync/schedule-safety': { SCHEDULE_STORAGE_KEY: 'schedule', scheduleHasContent: () => false,
        shouldQueueLocalValue: (key: string, current: string, previous: string) => key === 'study' && (current !== undefined || previous !== undefined) },
      '@/lib/sync/remote-record': { remoteRecordIsCurrent: () => false },
      '@/actions/backup-center': { createDueBackupVersions: async () => {} },
      '@/lib/diagnostic-events': { emitDiagnostic: () => {}, errorDetails: () => ({}) },
      '@/lib/sync/report-failure': { reportSyncFailure: async () => {} },
      '@/lib/sync/service-error': { SyncHttpError: class extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }, syncFailureStatus: () => 'server_unavailable' },
      '@/lib/sync/session-transport': { fetchAuthenticatedSync: async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET', body = init?.body ? JSON.parse(String(init.body)) : undefined;
        requests.push({ method, url, body });
        if (fail) throw new Error('network down');
        if (method === 'POST' && blocked) {
          await new Promise<void>((resolve, reject) => {
            release = resolve;
            init?.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
          });
        }
        if (init?.signal?.aborted) throw new DOMException('cancelled', 'AbortError');
        if (method === 'GET') {
          const key=new URL(url,'https://test.local').searchParams.get('key');
          return Response.json({ok:true,syncProtocol:3,records:key?cloudRecords.filter(record=>record.key===key):cloudRecords.map(record=>{const descriptor={...record};delete descriptor.value;return descriptor;}),next:null});
        }
        const operations = body.operations as Array<SyncOperation & {patch:any[]}>;
        if(conflict){
          cloudRecords=[{key:'study',value:{text:'remote'},revision:8,contentHash:digest({text:'remote'}),deleted:false,updatedAt:'2999-01-01T00:00:00Z'}];
          conflict=false;
          return Response.json({ok:true,remote:[],applied:[],conflicts:operations.map(operation=>({operationId:operation.id,key:operation.key,remoteValue:{text:'remote'},remoteRevision:8,remoteHash:digest({text:'remote'}),remoteDeleted:false,remoteUpdatedAt:'2999-01-01T00:00:00Z'}))});
        }
        const applied=operations.map(operation=>{
          const previous=cloudRecords.find(row=>row.key===operation.key);
          const value=operation.deleted?null:applyRecordDelta(previous?.deleted?undefined:previous?.value,operation.patch);
          const record={key:operation.key,value,revision:(previous?.revision??0)+1,contentHash:digest(value,operation.deleted),deleted:operation.deleted,updatedAt:operation.clientUpdatedAt};
          cloudRecords=cloudRecords.filter(row=>row.key!==operation.key).concat(record);
          return {operationId:operation.id,key:record.key,revision:record.revision,contentHash:record.contentHash};
        });
        return Response.json({ok:true,remote:[],conflicts:[],applied});
      } },
    };
    runInNewContext(compiled, { exports, require: (name: string) => modules[name] ?? {}, window: win, document: doc, navigator: nav,
      localStorage: storage, crypto: { randomUUID,subtle:webcrypto.subtle }, AbortController, DOMException, CustomEvent, TextEncoder, console,
      Date: class extends Date { static now() { return now; } } });
    exports.default({ userId: 'alice' });
    // The independent first effect manages local backups, not cloud sync.
    result.stop = effects[1]()!;
    tabs.push(result); return result;
  }
  return { tab, tabs, requests, storage, settings, outboxApi,
    set cloudRecords(value: SyncRecord[]) { cloudRecords = value; },
    get outbox() { return outbox; }, set blocked(value: boolean) { blocked = value; }, set conflict(value: boolean) { conflict = value; }, set fail(value: boolean) { fail = value; },
    release() { blocked = false; release?.(); }, advance(ms: number) { now += ms; tabs.forEach(tab => tab.ticks.forEach(tick => tick())); } };
}

test('four tabs idle for an hour share a bounded 30-second pull budget and no full-value downloads or uploads', async () => {
  const h = harness(); for (let i = 0; i < 4; i++) { h.tab(); await settle(); }
  for (let i = 0; i < 120; i++) { h.advance(30_000); await settle(); }
  assert.ok(h.requests.filter(request => request.method === 'GET' && request.url.includes('/v3')).length<=121);
  assert.ok(h.requests.filter(request => request.url.includes('?key=')).length <= 4);
  assert.equal(h.requests.filter(request => request.method === 'POST').length, 0);
  for (const tab of h.tabs) { assert.equal(tab.status.state, 'synced'); tab.stop(); }
});

test('hidden and offline pages pause automatic requests; network recovery uploads edits inside the cooldown', async () => {
  const h = harness(), tab = h.tab(); await settle(); const initial = h.requests.length;
  tab.doc.visibilityState = 'hidden'; h.advance(120_000); await settle(); assert.equal(h.requests.length, initial);
  tab.doc.visibilityState = 'visible'; tab.nav.onLine = false;
  h.storage.setItem('study', '{"text":"offline"}'); tab.win.dispatchEvent(new Event('offline'));
  h.advance(30_000); await settle(); assert.equal(h.requests.length, initial); assert.equal(h.outbox.length, 1);
  tab.nav.onLine = true; tab.win.dispatchEvent(new Event('online')); await settle();
  assert.equal(h.outbox.length, 0); assert.equal(tab.status.state, 'synced');
  tab.nav.onLine = false; h.storage.setItem('study', '{"text":"quick edit"}');
  tab.win.dispatchEvent(new Event('offline')); await settle();
  tab.nav.onLine = true; tab.win.dispatchEvent(new Event('online')); await settle();
  assert.equal(h.requests.filter(request => request.method === 'POST').length, 2);
  tab.stop();
});

test('a newer local edit during a conflict reply is preserved and requires an explicit choice', async () => {
  const h = harness(), tab = h.tab(); await settle();
  h.storage.setItem('study', '{"text":"old"}'); h.blocked = true; h.conflict = true;
  tab.win.dispatchEvent(new Event('jackyun-sync-retry')); await settle();
  h.storage.setItem('study', '{"text":"newer"}'); h.release(); await settle();
  assert.equal(h.storage.getItem('study'), '{"text":"newer"}');
  const writes = h.requests.filter(request => request.method === 'POST');
  assert.equal(writes.length, 1);assert.equal(h.outbox.length,1);assert.equal(tab.status.state,'conflict');
  assert.equal((await h.outboxApi.getConflicts())[0].localValue.text,'newer');tab.stop();
});

test('component unmount aborts an outstanding request without acknowledging its pending edit', async () => {
  const h = harness(), tab = h.tab(); await settle();
  h.storage.setItem('study', '{"text":"pending"}'); h.blocked = true;
  tab.win.dispatchEvent(new Event('jackyun-sync-retry')); await settle();
  tab.stop(); h.release(); await settle();
  assert.equal(h.outbox.length, 1);
  assert.equal(h.storage.getItem('study'), '{"text":"pending"}');
});

test('idle read failures retry after backoff and resume without any local edits', async () => {
  const h = harness(), tab = h.tab(); await settle(); h.fail = true;
  h.advance(60_000); await settle(); const failed = h.requests.length;
  assert.equal(tab.status.state, 'server_unavailable'); h.fail = false;
  h.advance(30_000); await settle(); assert.ok(h.requests.length > failed);
  assert.equal(tab.status.state, 'synced'); tab.stop();
});

test('a stationary foreground page receives another device edit without focus or local activity', async () => {
  const h = harness(), tab = h.tab(); await settle();
  h.cloudRecords = [{ ...cloud, contentHash:digest({text:'another device'}),value: { text: 'another device' } }];
  h.advance(60_000); await settle();
  assert.equal(h.storage.getItem('study'), '{"text":"another device"}');
  assert.equal(h.requests.filter(request => request.method === 'POST').length, 0);
  assert.equal(tab.status.state, 'synced'); tab.stop();
});

test('persisted auth pause publishes a retryable status instead of leaving initialization syncing',async()=>{
 const h=harness(),tab=h.tab();await settle();
 tab.win.dispatchEvent(Object.assign(new Event('jackyun-sync-lane'),{detail:{userId:'alice',lane:'workspace',state:'auth_required',nextAttemptAt:0,openUntil:0}}));
 await settle();assert.equal(tab.status.state,'auth_required');
 tab.win.dispatchEvent(new Event('jackyun-sync-retry'));await settle();assert.equal(tab.status.state,'synced');tab.stop();
});
