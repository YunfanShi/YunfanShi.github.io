import { isBackupableLegacyKey, legacyBackupPage, type BackupPage } from './pages.ts';
import { validateBackupMarkers } from './markers.ts';
import type { createAzureRecordClient } from '../sync/azure-records.ts';
type Source = ReturnType<typeof createAzureRecordClient>;
type CaptureRPC = (args: { target_page: BackupPage; sync_records: Record<string, unknown>[];
  source_generation: string | null; azure_generation: string | null }) => Promise<{data:unknown;error:unknown}>;

/** Source commit comes first; Azure only acknowledges the captured generation.
 * Receipts on the source allow a failed Azure acknowledgment to be retried. */
export async function createAzureDueBackups(source: Source, userId: string,
  listSourceMarkers: () => Promise<{data:unknown;error:unknown}>, capture: CaptureRPC): Promise<number> {
  const [local,remote] = await Promise.all([listSourceMarkers(),source.backupMarkers()]);
  if (local.error) throw Error('无法读取当前备份改动，自动备份未完成。');
  const localMarkers = validateBackupMarkers(local.data);
  const localByPage = new Map(localMarkers.map(m=>[m.page,m]));
  const remoteByPage = new Map(remote.map(m=>[m.page,m]));
  const due = [...new Set([...localMarkers,...remote].filter(m=>m.due).map(m=>m.page))];
  if (!due.length) return 0;
  const pages = new Set(due);
  // One stable Azure read is shared across due pages, including tombstones.
  const records = await source.list({ include:key=>isBackupableLegacyKey(key) && pages.has(legacyBackupPage(key)) });
  let created = 0;
  for (const page of due) {
    const result = await capture({ target_page:page,
      source_generation:localByPage.get(page)?.generation ?? null,
      azure_generation:remoteByPage.get(page)?.generation ?? null,
      sync_records:records.filter(r=>legacyBackupPage(r.key)===page).map(r=>({
        user_id:userId,storage_key:r.key,storage_value:r.value,revision:r.revision,content_hash:r.contentHash,
        deleted_at:r.deleted?r.updatedAt:null,client_updated_at:r.updatedAt,updated_at:r.updatedAt,
      })) });
    const receipt = result.data as {versionId?:unknown;created?:unknown} | null;
    if (result.error || !receipt || !Number.isSafeInteger(receipt.versionId) || Number(receipt.versionId)<=0
      || typeof receipt.created !== 'boolean') throw Error('自动备份尚未确认保存，改动标记会保留。');
    const marker = remoteByPage.get(page);
    // A false acknowledgment means a newer generation remains pending.
    // A network failure leaves this captured generation for a receipt-based retry.
    if (marker) await source.acknowledgeBackup(page,marker.generation,Number(receipt.versionId));
    if (receipt.created) created++;
  }
  return created;
}
