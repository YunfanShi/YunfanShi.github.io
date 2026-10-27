import { isBackupableLegacyKey, legacyBackupPage, type BackupPage } from './pages.ts';
import { canonicalJson } from '../sync/hash.ts';
import { resourceTargetsForStorageKeys } from '../sync/resource-model.ts';
import { scheduleHasContent, SCHEDULE_STORAGE_KEY } from '../sync/schedule-safety.ts';

const ARCHIVE_FORMAT = 'jackyun-v5-workspace';

export type V5WorkspaceArchive = {
  format: typeof ARCHIVE_FORMAT;
  version: 5;
  exportedAt: string;
  recordCount: number;
  records: Array<{ key: string; value: string; sha256: string }>;
  sha256: string;
};

type WorkspaceArchiveStorage = {
  keys: () => string[];
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  flush: () => Promise<void>;
};

type ApplyWorkspaceArchiveOptions = {
  archive: V5WorkspaceArchive;
  owner: string;
  storage: WorkspaceArchiveStorage;
  saveRecoveryPoint: (owner: string, page: BackupPage, values: Record<string, string>) => Promise<void>;
  queueV5Targets: (targets: ReturnType<typeof resourceTargetsForStorageKeys>) => Promise<void>;
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function archiveBody(archive: Omit<V5WorkspaceArchive, 'sha256'>): string {
  return canonicalJson(archive);
}

export async function createV5WorkspaceArchive(values: Record<string, string>, exportedAt = new Date().toISOString()): Promise<V5WorkspaceArchive> {
  const records = await Promise.all(Object.entries(values)
    .filter(([key, value]) => isBackupableLegacyKey(key) && typeof value === 'string')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(async ([key, value]) => ({ key, value, sha256: await sha256(value) })));
  const body: Omit<V5WorkspaceArchive, 'sha256'> = { format: ARCHIVE_FORMAT, version: 5, exportedAt, recordCount: records.length, records };
  return { ...body, sha256: await sha256(archiveBody(body)) };
}

export async function parseV5WorkspaceArchive(text: string): Promise<V5WorkspaceArchive> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON 文件格式错误。');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('文件不是 JackYun v5 本机归档。');
  const archive = parsed as Partial<V5WorkspaceArchive>;
  if (archive.format !== ARCHIVE_FORMAT || archive.version !== 5 || typeof archive.exportedAt !== 'string'
    || !Number.isSafeInteger(archive.recordCount) || !Array.isArray(archive.records)
    || archive.recordCount !== archive.records.length || typeof archive.sha256 !== 'string') {
    throw new Error('归档版本或记录数量无效。');
  }

  const seen = new Set<string>();
  for (const record of archive.records) {
    if (!record || typeof record !== 'object' || !isBackupableLegacyKey(record.key)
      || typeof record.value !== 'string' || typeof record.sha256 !== 'string' || seen.has(record.key)) {
      throw new Error('归档包含无效、重复或不允许的数据键。');
    }
    seen.add(record.key);
    if (await sha256(record.value) !== record.sha256) throw new Error(`记录完整性校验失败：${record.key}`);
    if (record.key === SCHEDULE_STORAGE_KEY) {
      let schedule: unknown;
      try { schedule = JSON.parse(record.value); } catch { throw new Error('归档中的 Schedule JSON 格式错误。'); }
      if (!scheduleHasContent(schedule)) throw new Error('拒绝从空 Schedule 归档覆盖本机数据。');
    }
  }
  const { sha256: checksum, ...body } = archive as V5WorkspaceArchive;
  if (await sha256(archiveBody(body)) !== checksum) throw new Error('归档整体 SHA-256 校验失败。');
  return archive as V5WorkspaceArchive;
}

export async function applyV5WorkspaceArchive({ archive, owner, storage, saveRecoveryPoint, queueV5Targets }: ApplyWorkspaceArchiveOptions): Promise<string[]> {
  const current = new Map<string, string>();
  for (const key of storage.keys()) {
    if (!isBackupableLegacyKey(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) current.set(key, value);
  }

  const changed = archive.records.filter((record) => current.get(record.key) !== record.value);
  if (!changed.length) return [];

  const beforeByPage = new Map<BackupPage, Record<string, string>>();
  for (const [key, value] of current) {
    const page = legacyBackupPage(key);
    const values = beforeByPage.get(page) ?? {};
    values[key] = value;
    beforeByPage.set(page, values);
  }
  for (const [page, values] of beforeByPage) await saveRecoveryPoint(owner, page, values);

  for (const record of changed) storage.setItem(record.key, record.value);
  await storage.flush();
  await queueV5Targets(resourceTargetsForStorageKeys(changed.map((record) => record.key)));
  return changed.map((record) => record.key);
}
