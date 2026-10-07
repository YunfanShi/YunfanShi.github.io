import { isBackupableLegacyKey, legacyBackupPage, type BackupPage } from './pages.ts';
import type { createAzureRecordClient } from '../sync/azure-records.ts';
import { SCHEDULE_STORAGE_KEY, scheduleHasContent } from '../sync/schedule-safety.ts';

type Source = ReturnType<typeof createAzureRecordClient>;
type BackupRPC = (args: { target_page: BackupPage; sync_records: Record<string, unknown>[];
  backup_reason: 'manual' | 'before_restore' }) => Promise<{ data: unknown; error: unknown }>;

/** Persist the active sync values together with the source-owned business tables.
 * The RPC commits the combined snapshot before any restore write is allowed. */
export async function saveAzurePageBackup(source: Source, userId: string, page: BackupPage,
  rpc: BackupRPC, reason: 'manual' | 'before_restore' = 'manual'): Promise<number> {
  const records = await source.list({ include: key => isBackupableLegacyKey(key) && legacyBackupPage(key) === page });
  const rows = records.map(r => ({ user_id: userId, storage_key: r.key, storage_value: r.value,
    revision: r.revision, content_hash: r.contentHash, deleted_at: r.deleted ? r.updatedAt : null,
    client_updated_at: r.updatedAt, updated_at: r.updatedAt }));
  const result = await rpc({ target_page: page, sync_records: rows, backup_reason: reason });
  if (result.error || !Number.isSafeInteger(result.data) || Number(result.data) <= 0) {
    throw Error('Azure 当前数据备份未保存，恢复未执行；请保留原始备份并稍后重试。');
  }
  return Number(result.data);
}

export async function restoreAzureSchedule(source: Source, userId: string, value: unknown, rpc: BackupRPC) {
  if (!scheduleHasContent(value)) throw Error('备份内容无效。');
  const current = await source.read(SCHEDULE_STORAGE_KEY);
  await saveAzurePageBackup(source, userId, 'schedule', rpc, 'before_restore');
  return source.write(SCHEDULE_STORAGE_KEY, value, false, current);
}
