'use server';

import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { ALL_BACKUP_PAGES, normalizeBackupPages, type BackupPage, type BackupTable } from '@/lib/backup/pages';
import { canonicalJson } from '@/lib/sync/hash';
import { inspectCloudBackup, type BackupInspection } from '@/lib/backup/inspection';
import type { DataArchiveV2, SyncRecord } from '@/types/sync';
import { azureBackupSource } from '@/lib/sync/azure-backup-source';
import { saveAzurePageBackup } from '@/lib/backup/azure-page-backup';
import { createAzureDueBackups } from '@/lib/backup/azure-automatic-backup';

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('请先登录。');
  return { supabase, user };
}

export type BackupVersion = {
  id: number;
  page: BackupPage;
  reason: 'automatic' | 'baseline' | 'before_restore' | 'manual';
  source_table: string | null;
  created_at: string;
  retention_exempt: boolean;
};

export async function listBackupVersions(page: BackupPage): Promise<BackupVersion[]> {
  normalizeBackupPages([page]);
  const { supabase, user } = await context();
  const { data, error } = await supabase.from('backup_center_versions')
    .select('id,page,reason,source_table,created_at,retention_exempt')
    .eq('user_id', user.id).eq('page', page).order('id', { ascending: false }).limit(100);
  if (error) throw new Error(`读取备份失败：${error.message}`);
  return (data ?? []) as BackupVersion[];
}

export async function createBackupVersion(page: BackupPage): Promise<number> {
  normalizeBackupPages([page]);
  const { supabase, user } = await context();
  const azure = await azureBackupSource(supabase);
  if (azure) return saveAzurePageBackup(azure, user.id, page,
    async args => await supabase.rpc('create_backup_page_with_sync', args));
  const { data, error } = await supabase.rpc('create_backup_page', { target_page: page });
  if (error || typeof data !== 'number') throw new Error(`创建备份失败：${error?.message ?? '未返回版本编号'}`);
  return data;
}

export async function createDueBackupVersions(): Promise<number> {
  const { supabase,user } = await context();
  const azure = await azureBackupSource(supabase);
  if (azure) return createAzureDueBackups(azure,user.id,
    async()=>await supabase.rpc('list_backup_change_markers'),
    async args=>await supabase.rpc('create_automatic_backup_with_sync',args));
  const { data, error } = await supabase.rpc('create_due_backup_pages');
  if (error) throw new Error(`自动备份失败：${error.message}`);
  return Number(data ?? 0);
}

export async function downloadBackupVersion(id: number): Promise<DataArchiveV2<BackupTable>> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('备份编号无效。');
  const { supabase, user } = await context();
  const { data, error } = await supabase.from('backup_center_versions')
    .select('snapshot,created_at').eq('user_id', user.id).eq('id', id).maybeSingle();
  if (error || !data) throw new Error('备份不存在或无法读取。');
  const tables = data.snapshot as DataArchiveV2<BackupTable>['tables'];
  const checksum = createHash('sha256').update(canonicalJson(tables)).digest('hex');
  return { version: 2, schema_version: 'sync-v2', exported_at: data.created_at, checksum, tables };
}

export async function inspectBackupVersion(id: number): Promise<BackupInspection> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('备份编号无效。');
  const { supabase, user } = await context();
  const { data, error } = await supabase.from('backup_center_versions')
    .select('page,snapshot').eq('user_id', user.id).eq('id', id).maybeSingle();
  if (error || !data) throw new Error(`无法查看这个版本：${error?.message ?? '版本不存在'}`);
  let currentSchedule: unknown;
  if (data.page === 'schedule') {
    const azure = await azureBackupSource(supabase);
    if (azure) currentSchedule = (await azure.read('jackyun_schedule_control_v1'))?.value;
    else {
      const current = await supabase.from('legacy_sync_data').select('storage_value')
        .eq('user_id', user.id).eq('storage_key', 'jackyun_schedule_control_v1').maybeSingle();
      if (!current.error) currentSchedule = current.data?.storage_value;
    }
  }
  return inspectCloudBackup(data.page, data.snapshot as Record<string, Record<string, unknown>[]>, currentSchedule);
}

export async function restoreBackupVersion(id: number): Promise<{ page: BackupPage; legacyRecords: SyncRecord[] }> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('备份编号无效。');
  const { supabase } = await context();
  if (process.env.AZURE_SYNC_API_URL) throw Error('Azure 云端页面恢复协调尚未启用，恢复未执行；请下载此版本并使用按项导入。');
  const { data, error } = await supabase.rpc('restore_backup_page', { backup_id: id });
  if (error || !data || typeof data !== 'object') throw new Error(`恢复失败：${error?.message ?? '没有返回恢复结果'}`);
  const result = data as { page: BackupPage; legacyRecords: SyncRecord[] };
  if (!ALL_BACKUP_PAGES.includes(result.page) || !Array.isArray(result.legacyRecords)) throw new Error('恢复结果无效。');
  return result;
}
