import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson } from './hash.ts';
import { joinSyncParts, splitSyncBody, MAX_SYNC_PARTS } from './transfer.ts';
import { syncValueFits, isSyncableStorageKey } from '../local-workspace.ts';
import type { SyncRecord, SyncOperation } from '../../types/sync.ts';
import { validateBackupMarkers, type BackupChangeMarker } from '../backup/markers.ts';
import type { BackupPage } from '../backup/pages.ts';

const afterKey = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b)) > 0;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function record(value: unknown): SyncRecord {
  const r = value as Partial<SyncRecord> | null;
  if (!r || typeof r.key !== 'string' || !isSyncableStorageKey(r.key)
    || !Number.isSafeInteger(r.revision) || Number(r.revision) < 1 || typeof r.deleted !== 'boolean'
    || typeof r.updatedAt !== 'string' || !Number.isFinite(Date.parse(r.updatedAt))
    || !(r.contentHash === null || typeof r.contentHash === 'string' && /^[a-f0-9]{64}$/i.test(r.contentHash))
    || typeof r.large !== 'boolean') throw Error('Azure 同步记录无效，请稍后重试。');
  return r as SyncRecord;
}

/** Per-request transport only. Azure authenticates the token and owns all writes. */
export function createAzureRecordClient({ endpoint, token, fetchImpl = fetch }: {
  endpoint: string; token: string; fetchImpl?: typeof fetch;
}) {
  const base = new URL(endpoint);
  if (base.protocol !== 'https:' || !/^jackyun-sync-9d26b2cc(?:-[a-z0-9]+)?\.(?:[a-z0-9-]+\.)?azurewebsites\.net$/.test(base.hostname)
    || base.username || base.password || base.pathname !== '/' || base.search || base.hash || !token) {
    throw Error('Azure 同步配置无效。');
  }
  const requestId = randomUUID();
  async function request(path: string, body?: unknown): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, base), { method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', redirect: 'error',
        signal: AbortSignal.timeout(45_000) });
    } catch { throw Error('Azure 同步服务不可用，原始导入文件与本地数据应保留。'); }
    if (!response.ok) throw Object.assign(Error(`Azure 同步请求失败（${response.status}），请稍后重试。`), { status: response.status });
    const reader = response.body?.getReader();
    if (!reader) throw Error('Azure 同步响应为空。');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const item = await reader.read(); if (item.done) break;
        size += item.value.byteLength;
        if (size > 10_000_000) throw Error('Azure 同步响应超过安全上限。');
        chunks.push(item.value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    let result: Record<string, unknown>;
    try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Error('Azure 同步响应无效。'); }
    if (!result || result.ok !== true) throw Error('Azure 同步请求未完成。');
    return result;
  }
  async function metadata(key: string): Promise<SyncRecord | null> {
    const result = await request(`/api/sync/v2?key=${encodeURIComponent(key)}`);
    if (!Array.isArray(result.records) || result.records.length > 1) throw Error('Azure 同步记录无效。');
    const r = result.records.length ? record(result.records[0]) : null;
    if (r && r.key !== key) throw Error('Azure 同步记录不匹配。');
    return r;
  }
  async function materialize(initial: SyncRecord): Promise<SyncRecord> {
    let r = initial;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (r.deleted || !r.large) return r;
      try {
        const parts: string[] = []; let count = 1;
        for (let part = 0; part < count; part++) {
          const chunk = await request(`/api/sync/v2/large?key=${encodeURIComponent(r.key)}&revision=${r.revision}&part=${part}`);
          if (chunk.revision !== r.revision || chunk.part !== part || !Number.isInteger(chunk.count)
            || Number(chunk.count) < 1 || Number(chunk.count) > MAX_SYNC_PARTS || typeof chunk.data !== 'string'
            || (part > 0 && chunk.count !== count)) throw Error('Azure 同步分块不完整。');
          count = Number(chunk.count); parts.push(chunk.data);
        }
        const value = joinSyncParts(parts);
        if (r.contentHash && createHash('sha256').update(canonicalJson(value)).digest('hex') !== r.contentHash) {
          throw Error('Azure 同步内容校验失败。');
        }
        return { ...r, value };
      } catch (error) {
        if ((error as { status?: number }).status !== 409 || attempt === 2) throw error;
        const latest = await metadata(r.key);
        if (!latest) throw Error('Azure 同步记录已变化，请重新导出。');
        r = latest;
      }
    }
    throw Error('Azure 同步记录持续变化，请重新导出。');
  }
  async function collect(values: boolean, include: (key: string) => boolean): Promise<SyncRecord[]> {
      const records: SyncRecord[] = []; let after = ''; let scanned = 0;
      for (;;) {
        const page = await request(`/api/sync/export?after=${encodeURIComponent(after)}`);
        if (!Array.isArray(page.records) || page.records.length > 20) throw Error('Azure 导出页无效。');
        const rows = page.records.map(record);
        if (rows.some((r, index) => !afterKey(r.key, index ? rows[index - 1].key : after))) throw Error('Azure 导出游标无效。');
        scanned += rows.length;
        for (const row of rows) if (include(row.key)) records.push(values ? await materialize(row) : row);
        if (scanned > 20_000) throw Error('数据量超过单次备份上限，请按页面分别备份。');
        if (page.next === null) return records;
        if (!rows.length || page.next !== rows.at(-1)?.key) throw Error('Azure 导出游标无效。');
        after = String(page.next);
      }
  }
  const manifest = (rows: SyncRecord[]) => JSON.stringify(rows.map(r=>[r.key,r.revision,r.contentHash,r.deleted,r.updatedAt]));
  return {
    async backupMarkers(): Promise<BackupChangeMarker[]> {
      return validateBackupMarkers((await request('/api/sync/backup-markers')).markers);
    },
    async acknowledgeBackup(page: BackupPage, generation: string, versionId: number): Promise<boolean> {
      const result = await request('/api/sync/backup-markers', { page,generation,versionId });
      if (typeof result.acknowledged !== 'boolean') throw Error('备份确认响应无效，改动标记需重新检查。');
      return result.acknowledged;
    },
    async list({ values = true, include = () => true }: { values?: boolean; include?: (key: string) => boolean } = {}): Promise<SyncRecord[]> {
      if (!values) return collect(false,include);
      // Confirm revisions after assembling values. A changing source produces
      // an error rather than a backup labeled complete with mixed revisions.
      for (let attempt=0;attempt<3;attempt++) {
        const rows=await collect(true,include);
        if (manifest(rows)===manifest(await collect(false,include))) return rows;
      }
      throw Error('云端数据持续变化，备份未完成，请稍后重新导出。');
    },
    async read(key: string): Promise<SyncRecord | null> {
      const r = await metadata(key); return r ? materialize(r) : null;
    },
    async write(key: string, value: unknown, deleted = false, expected?: SyncRecord | null,
      retry?: { operationId: string; clientUpdatedAt: string }): Promise<SyncRecord> {
      if (!isSyncableStorageKey(key)) throw Error('导入同步键无效。');
      if (retry && (expected === undefined || !UUID.test(retry.operationId) || !Number.isFinite(Date.parse(retry.clientUpdatedAt)))) {
        throw Error('恢复重试元数据无效。');
      }
      // A session ID is transported as the device identifier; it is never used
      // as authentication. The backend verifies the complete bearer token.
      let sessionId: unknown;
      try { sessionId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).session_id; }
      catch { throw Error('登录会话格式无效。'); }
      if (typeof sessionId !== 'string' || !UUID.test(sessionId)) throw Error('登录会话无效。');
      const current = await metadata(key);
      if (!retry && expected !== undefined && (current?.revision !== expected?.revision
        || current?.contentHash !== expected?.contentHash || current?.deleted !== expected?.deleted)) {
        throw Error('云端数据在恢复前备份后发生变化，恢复未执行；请重新检查。');
      }
      const timestamp = retry?.clientUpdatedAt ?? new Date().toISOString();
      const baseRecord = retry ? expected : current;
      const op: SyncOperation = { id: retry?.operationId ?? randomUUID(), key, baseRevision: baseRecord?.revision ?? 0,
        baseHash: baseRecord?.contentHash ?? null, baseValue: null, value: deleted ? null : value, deleted, clientUpdatedAt: timestamp };
      const body = { syncProtocol:3, deviceId: sessionId, device: { name: '数据恢复与导入', platform: 'web' }, operations: [op],
        ...(expected !== undefined ? { requireCurrentVersion: true } : {}) };
      let result: Record<string, unknown>;
      if (!syncValueFits(op.value) || Buffer.byteLength(JSON.stringify(body)) > 900_000) {
        const parts = splitSyncBody(JSON.stringify(body));
        for (let index = 0; index < parts.length; index++) {
          await request('/api/sync/v2/large', { uploadId: op.id, index, count: parts.length, data: parts[index] });
        }
        result = await request('/api/sync/v2/large', { uploadId: op.id, complete: true });
      } else result = await request('/api/sync/v2', body);
      const acknowledgments = Array.isArray(result.applied) ? result.applied : [];
      const ack = acknowledgments[0] as Record<string, unknown> | undefined;
      const expectedHash = createHash('sha256').update(deleted ? '__deleted__' : canonicalJson(value)).digest('hex');
      // The SQL RPC keeps the revision when the requested value is already
      // current. Accept that only when our base has the identical hash/state.
      const unchanged = Number(ack?.revision) === op.baseRevision && baseRecord?.contentHash === expectedHash && baseRecord.deleted === deleted;
      if (!ack || !Number.isSafeInteger(ack.revision) || Number(ack.revision)<1 || (Number(ack.revision) <= op.baseRevision && !unchanged) || ack.contentHash !== expectedHash || ack.operationId !== op.id || ack.key !== key || acknowledgments.length !== 1
        || (Array.isArray(result.remote) && result.remote.length) || (Array.isArray(result.conflicts) && result.conflicts.length)) {
        throw Error('云端数据已变化，导入未确认；请保留原始文件并重新检查。');
      }
      return record({ key, value: op.value, revision: ack.revision, contentHash: ack.contentHash,
        deleted, large: !deleted && (!syncValueFits(op.value) || Buffer.byteLength(JSON.stringify(op.value)) > 400_000), updatedAt: ack.updatedAt });
    },
  };
}
