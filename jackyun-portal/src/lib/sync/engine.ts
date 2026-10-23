import { canonicalJson } from './hash.ts';
import { createRecordDelta } from './delta.ts';
import { threeWayMerge } from './merge.ts';
import { storageValueToString, isSyncableStorageKey } from '../local-workspace.ts';
import { operationMatchesStorage } from './acknowledgment.ts';
import { isServerUnavailable } from './service-error.ts';
import { joinSyncParts, splitSyncBody, splitCompressedSyncBody, decodeSyncPart, MAX_SYNC_PARTS } from './transfer.ts';
import type { SyncOperation, SyncRecord, SyncConflict } from '../../types/sync.ts';

export interface SyncStore {
  getOutbox(): Promise<SyncOperation[]>;
  getMetadata(): Promise<SyncRecord[]>;
  saveMetadata(record: SyncRecord): Promise<void>;
  queueOperation(operation: SyncOperation): Promise<void>;
  replaceOperation(operation: SyncOperation, next: SyncOperation | null): Promise<boolean>;
  acknowledgeOperation(operation: SyncOperation, cloud: SyncRecord): Promise<boolean>;
  getConflicts(): Promise<SyncConflict[]>;
  saveConflict(conflict: SyncConflict): Promise<void>;
  removeConflict(id: string): Promise<void>;
}
export interface SyncEnvironment {
  store: SyncStore;
  snapshot(): Record<string, string>;
  read(key: string): string | null;
  write(key: string, value: string | null): void;
  backup(key: string): Promise<void>;
  changed(keys: string[]): void;
  request(url: string, init?: RequestInit): Promise<Response>;
  progress(message: string): void;
  deviceId(): Promise<string>;
  device(): { name: string; platform: string };
  cancelled(): boolean;
  now(): number;
  uuid(): string;
  wait?(milliseconds: number): Promise<void>;
}

const parse = (value: string | null | undefined): unknown => {
  if (value == null) return undefined;
  try { return JSON.parse(value); } catch { return value; }
};
const SYNC_READ_CONCURRENCY = 4;
async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  const errors: unknown[] = [];
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await task(items[index], index); }
      catch(error) { errors.push(error); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, worker));
  if (errors.length) throw errors[0];
  return results;
}
const same = (left: unknown, right: unknown) => (left === undefined) === (right === undefined) && canonicalJson(left) === canonicalJson(right);
const baseOf = (op: {baseRevision:number; baseValue:unknown; baseDeleted?:boolean}) => op.baseRevision === 0 || op.baseDeleted ? undefined : op.baseValue;
const valueOf = (record: SyncRecord) => record.deleted ? undefined : record.value;
const byteOrder = (left: string, right: string) => {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  for (let i = 0; i < Math.min(a.length,b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};

export class SyncProtocolError extends Error {
  status:number;
  constructor(message: string, status: number) { super(message);this.status=status; }
}

/** Durable intent + optimistic concurrency. Wall-clock time never chooses a winner. */
export function createWorkspaceSync(environment: SyncEnvironment) {
  const e = environment, store = e.store;
  let observed = e.snapshot();
  let captured=false;
  let compressedUploads=false;
  // Revision-bound parts survive a failed cycle in this tab. Never combine
  // fragments from different revisions; bound retained transfer memory.
  const downloads = new Map<string, Map<number, {count:number;data:string}>>();
  let cachedBytes = 0;
  let activeRequests = 0;
  const requestWaiters: Array<()=>void> = [];
  function dropDownload(id:string) {
    for (const part of downloads.get(id)?.values() ?? []) cachedBytes -= part.data.length;
    downloads.delete(id);
  }
  async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    // Share one budget across records AND their chunks (4 x 4 is not 4).
    if (activeRequests >= SYNC_READ_CONCURRENCY) await new Promise<void>(resolve=>requestWaiters.push(resolve));
    else activeRequests++;
    try {
      if (e.cancelled()) throw new DOMException('Sync cancelled','AbortError');
      const response = await e.request(url,init);
      if (e.cancelled()) throw new DOMException('Sync cancelled','AbortError');
      const payload = await response.json().catch(error => {
        if (error instanceof SyntaxError) return null;
        throw error; // A timeout while streaming the body is a retryable read too.
      }) as Record<string, unknown> | null;
      if (!response.ok) {
        const error = typeof payload?.error === 'object' ? payload.error as {code?: string;message?:string} : {code:String(payload?.code ?? payload?.error ?? '')};
        throw new SyncProtocolError(error?.code === 'SYNC_UPGRADE_REQUIRED' ? '请刷新所有设备的旧页面后再同步；本机修改已保留。'
          : `同步请求未完成 (${response.status}${error?.code ? ` · ${error.code}` : ''})`,response.status);
      }
      if (!payload || payload.ok !== true) throw Error('同步响应未确认，修改已保留。');
      return payload;
    } finally {
      const next=requestWaiters.shift();
      if(next)next();else activeRequests--;
    }
  }
  async function json(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    for (let attempt=0;;attempt++) {
      try { return await requestJson(url,init); }
      catch (error) {
        // Mutations retain their durable operation IDs and retry next cycle.
        // Only safe reads get one short, jittered retry here.
        if (e.cancelled() || attempt >= 1 || (init?.method && init.method !== 'GET') || !isServerUnavailable(error,true)) throw error;
        await (e.wait ?? (ms=>new Promise(resolve=>setTimeout(resolve,ms))))(500+Math.floor(Math.random()*500));
      }
    }
  }
  function validate(record: SyncRecord) {
    if (!record || !isSyncableStorageKey(record.key) || !Number.isSafeInteger(record.revision) || record.revision < 0
      || typeof record.deleted !== 'boolean' || !(record.contentHash === null || /^[a-f0-9]{64}$/.test(record.contentHash))) throw Error('同步版本无效，原始数据已保留。');
  }
  async function materialize(record: SyncRecord): Promise<SyncRecord> {
    validate(record);
    if (!record.large || record.deleted) return record;
    const downloadId = JSON.stringify([record.key,record.revision,record.contentHash]);
    for (const id of downloads.keys()) if (JSON.parse(id)[0] === record.key && id !== downloadId) dropDownload(id);
    const readPart = async (part: number, expectedCount?: number) => {
      const cached = downloads.get(downloadId)?.get(part);
      if (cached && (expectedCount === undefined || cached.count === expectedCount)) return cached;
      e.progress(`下载分片 ${part+1}${expectedCount ? ` / ${expectedCount}` : ''}`);
      const chunk = await json(`/api/sync/v2/large?key=${encodeURIComponent(record.key)}&revision=${record.revision}&part=${part}${typeof DecompressionStream === 'function' ? '&encoding=gzip' : ''}`);
      if (chunk.revision !== record.revision || chunk.part !== part || !Number.isInteger(chunk.count) || Number(chunk.count) < 1 || Number(chunk.count) > MAX_SYNC_PARTS
        || typeof chunk.data !== 'string' || (expectedCount !== undefined && chunk.count !== expectedCount)) throw Error('同步分片不完整，原始数据已保留。');
      const decoded = { count: Number(chunk.count), data: await decodeSyncPart(chunk.data,chunk.encoding) };
      if (cachedBytes+decoded.data.length > 32_000_000) { downloads.clear(); cachedBytes=0; }
      if (!downloads.has(downloadId)) downloads.set(downloadId,new Map());
      downloads.get(downloadId)!.set(part,decoded); cachedBytes+=decoded.data.length;
      return decoded;
    };
    const first = await readPart(0);
    const remaining = await mapWithConcurrency(Array.from({ length: first.count - 1 }, (_, index) => index + 1), SYNC_READ_CONCURRENCY,
      (part) => readPart(part, first.count));
    const parts = [first.data, ...remaining.map((part) => part.data)];
    let value: unknown;
    try { value = joinSyncParts(parts); }
    catch(error) { dropDownload(downloadId); throw error; }
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(value)));
    if (record.contentHash && [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('') !== record.contentHash) {
      dropDownload(downloadId); throw Error('同步内容校验失败，原始数据已保留。');
    }
    dropDownload(downloadId);
    return {...record,value,large:false};
  }
  async function readRecord(key: string): Promise<SyncRecord | null> {
    const payload = await json(`/api/sync/v2?key=${encodeURIComponent(key)}`);
    if (!Array.isArray(payload.records) || payload.records.length > 1) throw Error('同步记录无效。');
    const record = payload.records[0] as SyncRecord | undefined;
    if (!record) return null;
    if (record.key !== key) throw Error('同步记录不匹配。');
    return materialize(record);
  }
  async function capture() {
    const snapshot = e.snapshot();
    const changed=[...new Set([...Object.keys(observed),...Object.keys(snapshot)])].filter(key=>!captured || observed[key]!==snapshot[key]);
    if (!captured) for (const legacy of await store.getOutbox()) if (legacy.sequence === undefined) await store.replaceOperation(legacy,{...legacy,id:e.uuid(),sequence:0});
    if(!changed.length){captured=true;return;}
    const metadata = new Map((await store.getMetadata()).map(r=>[r.key,r]));
    const pending = new Map((await store.getOutbox()).map(op=>[op.key,op]));
    for (const key of changed) {
      const current = snapshot[key];
      if (current === undefined && observed[key] === undefined) continue; // Missing startup data is not a deletion.
      const operation = pending.get(key), base = metadata.get(key);
      if (operation && operationMatchesStorage(operation,current ?? null)) continue;
      // An undo is also intent: the previous queued edit may already be in flight.
      if (!operation && base && same(parse(current),valueOf(base))) continue;
      await store.queueOperation({id:e.uuid(),key,baseRevision:base?.revision ?? 0,baseHash:base?.contentHash ?? null,
        baseValue:base?.deleted ? null : base?.value ?? null,baseDeleted:base?.deleted ?? true,value:parse(current) ?? null,deleted:current === undefined,
        clientUpdatedAt:new Date(e.now()).toISOString()});
    }
    observed = snapshot;
    captured=true;
  }
  async function applyLocal(key: string, value: unknown, expected: string | null, backedUp = false): Promise<boolean> {
    const next = value === undefined ? null : storageValueToString(value);
    if (expected === next) return true;
    if (!backedUp) await e.backup(key); // A failed backup prevents replacement.
    if (e.cancelled() || e.read(key) !== expected) return false;
    e.write(key,next);
    if (next === null) delete observed[key]; else observed[key] = next;
    e.changed([key]);
    return true;
  }
  async function reconcile(record: SyncRecord) {
    await capture();
    const expected = e.read(record.key), local = parse(expected);
    const pending = (await store.getOutbox()).find(op=>op.key === record.key);
    const metadata = (await store.getMetadata()).find(row=>row.key===record.key);
    if (record.revision < Math.max(metadata?.revision ?? 0,pending?.baseRevision ?? 0)) {
      throw Error('云端版本发生回退，本机修改和同步基准已保留。');
    }
    const blocked = (await store.getConflicts()).find(c=>c.key === record.key);
    if (blocked && !pending) {
      return;
    }
    if (!pending) {
      if (!await applyLocal(record.key,valueOf(record),expected)) { await capture(); return; }
      await store.saveMetadata(record);
      return;
    }
    const base = baseOf(pending);
    const merged = threeWayMerge(base,local,valueOf(record));
    if (merged.conflicts.length) {
      await e.backup(record.key);
      if (e.cancelled() || e.read(record.key) !== expected) return;
      await store.saveConflict({operationId:blocked?.operationId ?? pending.id,key:record.key,baseRevision:pending.baseRevision,baseValue:pending.baseValue,baseDeleted:pending.baseDeleted,
        localValue:local ?? null,localDeleted:local === undefined,remoteValue:record.value,remoteDeleted:record.deleted,
        remoteRevision:record.revision,remoteHash:record.contentHash,remoteUpdatedAt:record.updatedAt,paths:merged.conflicts});
      return;
    }
    await e.backup(record.key);
    if (e.cancelled() || e.read(record.key) !== expected) { await capture(); return; }
    // Persist a no-op resolution so the server closes its conflict too.
    const needsResolution=Boolean(blocked) || pending.baseRevision!==record.revision || pending.baseHash!==record.contentHash;
    const next: SyncOperation | null = !needsResolution && same(merged.merged,valueOf(record)) ? null : {
      ...pending,id:e.uuid(),baseRevision:record.revision,baseHash:record.contentHash,baseValue:record.deleted ? null : record.value,baseDeleted:record.deleted,
      value:merged.merged ?? null,deleted:merged.merged === undefined,clientUpdatedAt:new Date(e.now()).toISOString(),resolvesOperationId:blocked?.operationId ?? pending.id,
    };
    if (!await applyLocal(record.key,merged.merged,expected,true)) { await capture(); return; }
    if (!await store.replaceOperation(pending,next)) return;
    await store.saveMetadata(record);
    await store.removeConflict(pending.id);
    if (blocked && blocked.operationId !== pending.id) await store.removeConflict(blocked.operationId);
  }
  async function pull() {
    let after = ''; let scanned = 0;
    let deferred: unknown;
    const metadata = new Map((await store.getMetadata()).map(r=>[r.key,r]));
    const pendingKeys = new Set((await store.getOutbox()).map(op=>op.key));
    for (;;) {
      const page = await json(`/api/sync/v3${after ? `?after=${encodeURIComponent(after)}` : ''}`);
      if (page.syncProtocol !== 3 || !Array.isArray(page.records) || page.records.length > 100) throw Error('同步协议不兼容，原始数据已保留。');
      compressedUploads=page.transferEncoding==='gzip';
      let previous = after;
      const descriptors = page.records as SyncRecord[];
      const toRead: SyncRecord[] = [];
      for (const descriptor of descriptors) {
        validate(descriptor);
        if (byteOrder(descriptor.key,previous) <= 0) throw Error('同步游标无效。');
        previous = descriptor.key; scanned++;
        const base = metadata.get(descriptor.key);
        if (base?.revision === descriptor.revision && base.contentHash === descriptor.contentHash && base.deleted === descriptor.deleted
          && (base.deleted || e.read(descriptor.key) !== null || pendingKeys.has(descriptor.key))) continue;
        toRead.push(descriptor);
      }
      const records = await mapWithConcurrency(toRead, SYNC_READ_CONCURRENCY, async (descriptor) => {
        try { return {record:await readRecord(descriptor.key)}; }
        catch(error) { return {error}; }
      });
      for (const result of records) {
        if ('error' in result) {
          if (!isServerUnavailable(result.error,true)) throw result.error;
          deferred ??= result.error;
        } else if (result.record) await reconcile(result.record);
      }
      if (scanned > 20_000) throw Error('单次同步记录超过上限，修改已保留。');
      if (page.next === null) break;
      if (!page.records.length || page.next !== previous || byteOrder(previous,after) <= 0) throw Error('同步游标没有前进。');
      after = previous;
    }
    if (deferred) throw deferred;
  }
  async function flush() {
    const attempts = new Map<string,number>();
    for (let batch = 0; batch < 4; batch++) {
      await capture();
      const blocked = new Set((await store.getConflicts()).map(c=>c.key));
      const operations = (await store.getOutbox()).filter(op=>!blocked.has(op.key) && (attempts.get(op.key) ?? 0) < 2).slice(0,10);
      if (!operations.length || e.cancelled()) break;
      const wire: Array<Record<string,unknown>> = []; const sent: SyncOperation[] = [];
      for (const operation of operations) {
        const {value,baseValue,...identity} = operation;
        const next = {...identity,patch:createRecordDelta(baseOf({...operation,baseValue}),operation.deleted ? undefined : value)};
        const bytes = new TextEncoder().encode(JSON.stringify([...wire,next])).length;
        if (wire.length && bytes > 220_000) break;
        wire.push(next); sent.push(operation);
      }
      const body = JSON.stringify({syncProtocol:3,requireCurrentVersion:true,deviceId:await e.deviceId(),device:e.device(),operations:wire});
      let response: Record<string,unknown>;
      if (new TextEncoder().encode(body).length > 250_000) {
        const parts = compressedUploads ? await splitCompressedSyncBody(body) : splitSyncBody(body), uploadId = sent[0].id;
        for (let part = 0; part < parts.length; part++) {
          e.progress(`上传分片 ${part+1} / ${parts.length}`);
          await json('/api/sync/v2/large',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadId,index:part,count:parts.length,data:parts[part]})});
        }
        response = await json('/api/sync/v2/large',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadId,complete:true})});
      } else response = await json('/api/sync/v2',{method:'POST',headers:{'Content-Type':'application/json'},body});
      if (!Array.isArray(response.applied) || !Array.isArray(response.conflicts) || !Array.isArray(response.remote)) throw Error('云端没有确认本次修改。');
      let confirmed = 0;
      for (const operation of sent) {
        attempts.set(operation.key,(attempts.get(operation.key) ?? 0)+1);
        const applied = (response.applied as Array<{operationId:string;key:string;revision:number;contentHash:string;updatedAt?:string}>).find(a=>a.operationId === operation.id && a.key === operation.key);
        if (applied) {
          const cloud: SyncRecord = {key:operation.key,value:operation.value,deleted:operation.deleted,revision:applied.revision,contentHash:applied.contentHash,updatedAt:applied.updatedAt ?? operation.clientUpdatedAt};
          validate(cloud);
          const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(operation.deleted ? '__deleted__' : canonicalJson(operation.value)));
          if (applied.revision < operation.baseRevision || (applied.revision===operation.baseRevision && applied.contentHash!==operation.baseHash)
            || applied.contentHash !== [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')) throw Error('上传确认与本机内容不符，修改已保留。');
          await store.saveMetadata(cloud);
          await store.acknowledgeOperation(operation,cloud);
          if (operation.resolvesOperationId) await store.removeConflict(operation.resolvesOperationId);
          confirmed++; continue;
        }
        const conflict = (response.conflicts as SyncConflict[]).find(c=>c.operationId === operation.id && c.key === operation.key);
        const remote = (response.remote as SyncRecord[]).find(r=>r.key === operation.key);
        if (conflict || remote) {
          const record = remote ?? {key:operation.key,value:conflict!.remoteValue,deleted:conflict!.remoteDeleted,revision:conflict!.remoteRevision,
            contentHash:conflict!.remoteHash,updatedAt:conflict!.remoteUpdatedAt ?? operation.clientUpdatedAt,large:conflict!.remoteLarge};
          await reconcile(await materialize(record)); confirmed++;
        }
      }
      if (confirmed !== sent.length) throw Error('部分修改未被云端确认，待上传数据已保留。');
    }
  }
  async function resolve(operationId: string, choice: 'local' | 'remote') {
    const conflict = (await store.getConflicts()).find(c=>c.operationId === operationId);
    if (!conflict) return;
    const remote = await readRecord(conflict.key);
    const current = e.read(conflict.key), local = parse(current);
    if (!remote || remote.revision !== conflict.remoteRevision || remote.contentHash !== conflict.remoteHash
      || !same(local,conflict.localDeleted ? undefined : conflict.localValue)) {
      if (remote) await store.saveConflict({...conflict,localValue:local ?? null,localDeleted:local === undefined,remoteValue:remote.value,
        remoteDeleted:remote.deleted,remoteRevision:remote.revision,remoteHash:remote.contentHash,remoteUpdatedAt:remote.updatedAt});
      throw Error('冲突中的内容又有变化，请重新检查后选择。');
    }
    const operation = (await store.getOutbox()).find(op=>op.key === conflict.key);
    if (!operation) throw Error('本机修改队列已变化，请刷新同步中心。');
    const chosen = choice === 'remote' ? valueOf(remote) : threeWayMerge(baseOf(conflict),local,valueOf(remote)).merged;
    await e.backup(conflict.key);
    if (e.cancelled() || e.read(conflict.key) !== current) throw Error('本机数据刚有修改，选择未应用。');
    // Even accepting remote data needs an acknowledged no-op to close the
    // server conflict, not just remove this device's copy of it.
    const next: SyncOperation = {...operation,id:e.uuid(),baseRevision:remote.revision,
      baseHash:remote.contentHash,baseValue:remote.deleted ? null : remote.value,baseDeleted:remote.deleted,value:chosen ?? null,deleted:chosen === undefined,
      resolvesOperationId:operationId,clientUpdatedAt:new Date(e.now()).toISOString()};
    if (!await applyLocal(conflict.key,chosen,current,true)) { await capture(); throw Error('本机又有修改，已保留待上传。'); }
    if (!await store.replaceOperation(operation,next)) throw Error('另一个标签页刚有修改，选择未完成；请重新查看本机内容。');
    await store.saveMetadata(remote);
    await store.removeConflict(operationId);
  }
  async function synchronize() {
    let deferred: unknown;
    try { await pull(); } catch (error) {
      if (!isServerUnavailable(error,true) || e.cancelled()) throw error;
      deferred=error;
    }
    // Failed reads must not starve unrelated durable uploads. The server's
    // revision/hash checks still protect every write from stale overwrites.
    await flush();
    if (deferred) throw deferred;
  }
  return {capture,pull,flush,resolve,synchronize};
}
