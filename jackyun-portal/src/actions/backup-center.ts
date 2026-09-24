'use server';

import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { ALL_BACKUP_PAGES, normalizeBackupPages, type BackupPage, type BackupTable } from '@/lib/backup/pages';
import { canonicalJson } from '@/lib/sync/hash';
import type { DataArchiveV2, SyncRecord } from '@/types/sync';

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
};

export async function listBackupVersions(page: BackupPage): Promise<BackupVersion[]> {
  normalizeBackupPages([page]);
  const { supabase, user } = await context();
  const { data, error } = await supabase.from('backup_center_versions')
    .select('id,page,reason,source_table,created_at')
    .eq('user_id', user.id).eq('page', page).order('id', { ascending: false }).limit(100);
  if (error) throw new Error(`读取备份失败：${error.message}`);
  return (data ?? []) as BackupVersion[];
}

export async function getBackupPreferences(): Promise<20 | 50 | 100> {
  const { supabase, user } = await context();
  const { data, error } = await supabase.from('backup_center_preferences')
    .select('max_versions').eq('user_id', user.id).maybeSingle();
  if (error) throw new Error(`读取备份设置失败：${error.message}`);
  return (data?.max_versions ?? 50) as 20 | 50 | 100;
}

export async function setBackupPreferences(maxVersions: 20 | 50 | 100) {
  if (![20, 50, 100].includes(maxVersions)) throw new Error('只能保留 20、50 或 100 个版本。');
  const { supabase } = await context();
  const { error } = await supabase.rpc('set_backup_limit', { new_limit: maxVersions });
  if (error) throw new Error(`保存备份设置失败：${error.message}`);
}

export async function createBackupVersion(page: BackupPage): Promise<number> {
  normalizeBackupPages([page]);
  const { supabase } = await context();
  const { data, error } = await supabase.rpc('create_backup_page', { target_page: page });
  if (error || typeof data !== 'number') throw new Error(`创建备份失败：${error?.message ?? '未返回版本编号'}`);
  return data;
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

export async function restoreBackupVersion(id: number): Promise<{ page: BackupPage; legacyRecords: SyncRecord[] }> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('备份编号无效。');
  const { supabase } = await context();
  const { data, error } = await supabase.rpc('restore_backup_page', { backup_id: id });
  if (error || !data || typeof data !== 'object') throw new Error(`恢复失败：${error?.message ?? '没有返回恢复结果'}`);
  const result = data as { page: BackupPage; legacyRecords: SyncRecord[] };
  if (!ALL_BACKUP_PAGES.includes(result.page) || !Array.isArray(result.legacyRecords)) throw new Error('恢复结果无效。');
  return result;
}
