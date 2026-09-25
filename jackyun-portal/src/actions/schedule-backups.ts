'use server';

import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { canonicalJson } from '@/lib/sync/hash';
import { SCHEDULE_STORAGE_KEY, scheduleHasContent } from '@/lib/sync/schedule-safety';

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('请先登录。');
  return { supabase, user };
}

export async function listScheduleBackups() {
  const { supabase, user } = await context();
  const { data, error } = await supabase.from('schedule_version_backups')
    .select('id, revision, created_at').eq('user_id', user.id)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(30);
  if (error) throw new Error(`无法读取 Schedule 备份：${error.message}`);
  return data ?? [];
}

async function getBackup(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('备份编号无效。');
  const { supabase, user } = await context();
  const { data, error } = await supabase.from('schedule_version_backups')
    .select('id, revision, created_at, storage_value').eq('user_id', user.id).eq('id', id).maybeSingle();
  if (error || !data) throw new Error('备份不存在或无法读取。');
  if (!scheduleHasContent(data.storage_value)) throw new Error('备份内容无效。');
  return { supabase, user, backup: data };
}

export async function downloadScheduleBackup(id: number) {
  const { backup } = await getBackup(id);
  return { version: 1, createdAt: backup.created_at, revision: backup.revision, schedule: backup.storage_value };
}

export async function restoreScheduleBackup(id: number) {
  const { supabase, user, backup } = await getBackup(id);
  const timestamp = new Date().toISOString();
  const contentHash = createHash('sha256').update(canonicalJson(backup.storage_value)).digest('hex');
  const { data: current, error: readError } = await supabase.from('legacy_sync_data')
    .select('revision').eq('user_id', user.id).eq('storage_key', SCHEDULE_STORAGE_KEY).maybeSingle();
  if (readError || !current) throw new Error('无法读取当前云端 Schedule。');
  const { error: backupError } = await supabase.rpc('create_backup_page', { target_page: 'schedule' });
  if (backupError) throw new Error(`恢复前备份失败：${backupError.message}`);
  const { data, error } = await supabase.from('legacy_sync_data').update({
    storage_value: backup.storage_value,
    revision: Number(current.revision) + 1,
    content_hash: contentHash,
    deleted_at: null,
    client_updated_at: timestamp,
    updated_at: timestamp,
  }).eq('user_id', user.id).eq('storage_key', SCHEDULE_STORAGE_KEY).eq('revision', current.revision)
    .select('revision').maybeSingle();
  if (error || !data) throw new Error(`恢复失败：${error?.message ?? '云端 Schedule 不存在'}`);
  return { value: backup.storage_value, revision: data.revision, contentHash, updatedAt: timestamp };
}
