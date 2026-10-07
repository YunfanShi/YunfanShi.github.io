'use server';

import { serviceErrorMessage } from '@/lib/service-errors';

import { createClient } from '@/lib/supabase/server';
import { azureBackupSource } from '@/lib/sync/azure-backup-source';
import { createHash } from 'node:crypto';
import type { DataArchiveV2 } from '@/types/sync';
import { canonicalJson } from '@/lib/sync/hash';
import { ALL_BACKUP_PAGES, BACKUP_TABLES, isBackupableLegacyKey, isBackupableSettingKey, legacyBackupPage, normalizeBackupPages, tableBackupPage, type BackupPage, type BackupTable } from '@/lib/backup/pages';
import { scheduleHasContent, SCHEDULE_STORAGE_KEY } from '@/lib/sync/schedule-safety';

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user }, error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw new Error(serviceErrorMessage(authError, '认证服务'));
  if (!user) throw new Error('登录会话已失效，请重新登录。（SESSION_EXPIRED）');
  return { supabase, user };
}

const DATA_TABLES = BACKUP_TABLES;
type DataTable = BackupTable;
export type DataArchiveV1 = { exported_at: string; version: 1; tables: Partial<Record<DataTable, Record<string, unknown>[]>> };
export type DataArchive = DataArchiveV1 | DataArchiveV2<DataTable>;

function checksum(tables: DataArchive['tables']): string {
  return createHash('sha256').update(canonicalJson(tables)).digest('hex');
}

function assertValidArchive(archive: DataArchive) {
  if (!archive || !archive.tables || (archive.version !== 1 && archive.version !== 2)) throw new Error('Unsupported backup format');
  if (archive.version === 2 && archive.checksum !== checksum(archive.tables)) throw new Error('Backup checksum mismatch');
  if (typeof archive.tables !== 'object' || Array.isArray(archive.tables)) throw new Error('Backup tables must be an object');
  for (const [table, rows] of Object.entries(archive.tables)) {
    if (!DATA_TABLES.includes(table as DataTable) || !Array.isArray(rows) || rows.length > 20_000
      || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error(`Invalid backup table: ${table}`);
    }
    if (table === 'legacy_sync_data' && rows.some((row) => !isBackupableLegacyKey(row.storage_key)
      || (row.storage_key === SCHEDULE_STORAGE_KEY && !scheduleHasContent(row.storage_value)))) {
      throw new Error('备份文件含不允许导入的同步键或空 Schedule。');
    }
    if (table === 'user_settings' && rows.some((row) => !isBackupableSettingKey(row.key))) {
      throw new Error('备份文件含不允许导入的设置项。');
    }
  }
}

export async function exportAllUserData(selectedPages?: BackupPage[]): Promise<DataArchiveV2<DataTable>> {
  const { supabase, user } = await getAuthenticatedUser();
  const azure = await azureBackupSource(supabase);
  const pages = new Set(normalizeBackupPages(selectedPages ?? ALL_BACKUP_PAGES));
  const tables: Partial<Record<DataTable, Record<string, unknown>[]>> = {};
  const readTable = async (table: DataTable, quizSessionIds?: string[]): Promise<Record<string, unknown>[]> => {
    if (table === 'legacy_sync_data' && azure) {
      return (await azure.list({ include: key => isBackupableLegacyKey(key) && pages.has(legacyBackupPage(key)) })).map(r=>({ user_id:user.id,storage_key:r.key,storage_value:r.value,
        revision:r.revision,content_hash:r.contentHash,deleted_at:r.deleted?r.updatedAt:null,
        client_updated_at:r.updatedAt,updated_at:r.updatedAt }));
    }
    const rows: Record<string, unknown>[] = [];
    const pageSize = 500;
    if (table === 'quiz_questions' && !quizSessionIds?.length) return [];
    const sessionGroups = table === 'quiz_questions'
      ? Array.from({ length: Math.ceil(quizSessionIds!.length / 100) }, (_, index) => quizSessionIds!.slice(index * 100, (index + 1) * 100))
      : [null];
    for (const sessionGroup of sessionGroups) {
      for (let offset = 0; offset <= 20_000; offset += pageSize) {
        let query = supabase.from(table).select('*')
          .order(table === 'focus_settings' || table === 'quiz_settings' ? 'user_id' : table === 'reader_books' ? 'book_id' : 'id')
          .range(offset, offset + pageSize - 1);
        if (sessionGroup) query = query.in('session_id', sessionGroup);
        else query = query.eq('user_id', user.id);
        const { data, error } = await query;
        if (error) throw new Error(`${table}: ${error.message}`);
        rows.push(...(data ?? []) as Record<string, unknown>[]);
        if (rows.length > 20_000) throw new Error(`${table}: 数据量超过单次备份上限，请按页面分别备份。`);
        if ((data ?? []).length < pageSize) break;
      }
    }
    return rows;
  };
  const selectedTables = DATA_TABLES.filter((table) => table === 'legacy_sync_data' || pages.has(tableBackupPage(table)));
  let quizSessionIds: string[] = [];
  if (selectedTables.includes('quiz_questions')) {
    const sessions = await readTable('quiz_sessions');
    quizSessionIds = sessions.map((row) => String(row.id));
    tables.quiz_sessions = sessions;
  }
  await Promise.all(selectedTables.map(async (table) => {
    if (table === 'quiz_sessions' && tables.quiz_sessions) return;
    const rows = await readTable(table, quizSessionIds);
    tables[table] = table === 'legacy_sync_data'
      ? rows.filter((row) => isBackupableLegacyKey(row.storage_key) && pages.has(legacyBackupPage(row.storage_key)))
      : table === 'user_settings'
        ? rows.filter((row) => isBackupableSettingKey(row.key))
        : rows;
  }));
  return { exported_at: new Date().toISOString(), version: 2, schema_version: 'sync-v2', checksum: checksum(tables), tables };
}

export async function previewDataImport(archive: DataArchive) {
  assertValidArchive(archive);
  const { supabase, user } = await getAuthenticatedUser();
  const azure = await azureBackupSource(supabase);
  const azureCount = azure && Array.isArray(archive.tables.legacy_sync_data) ? (await azure.list({ values: false })).length : null;
  return Promise.all(DATA_TABLES.filter((table) => Array.isArray(archive.tables?.[table])).map(async (table) => {
    const incoming = archive.tables?.[table] ?? [];
    const local = table === 'legacy_sync_data' && azureCount !== null ? azureCount : table === 'quiz_questions'
      ? 0
      : (await supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', user.id)).count ?? 0;
    return { table, incoming: incoming.length, local, changed: incoming.length > 0 };
  }));
}

export async function importSelectedData(archive: DataArchive, selected: DataTable[]): Promise<{ imported: string[]; skipped: string[] }> {
  assertValidArchive(archive);
  if (!Array.isArray(selected) || selected.some((table) => !DATA_TABLES.includes(table))) throw new Error('导入表选择无效。');
  const { supabase, user } = await getAuthenticatedUser();
  const azure = await azureBackupSource(supabase);
  const imported: string[] = []; const skipped: string[] = [];
  for (const table of new Set(selected)) {
    if (!DATA_TABLES.includes(table) || !Array.isArray(archive.tables?.[table])) { skipped.push(table); continue; }
    const rows = archive.tables[table] ?? [];
    if (!rows.length) { skipped.push(table); continue; }
    if (table === 'legacy_sync_data' && azure) {
      for (const row of rows) await azure.write(String(row.storage_key),row.storage_value,Boolean(row.deleted_at));
      imported.push(table); continue;
    }
    const prepared = rows.map((row) => table === 'quiz_questions' ? row : { ...row, user_id: user.id });
    for (let offset = 0; offset < prepared.length; offset += 200) {
      const { error } = await supabase.from(table).upsert(prepared.slice(offset, offset + 200));
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    imported.push(table);
  }
  return { imported, skipped };
}

export async function exportUserData(format: 'json' | 'csv' = 'json'): Promise<string> {
  const { supabase, user } = await getAuthenticatedUser();

  const [vocabResult, studyPlansResult, poemsResult, playlistsResult, countdownsResult] =
    await Promise.all([
      supabase.from('vocab_words').select('*').eq('user_id', user.id),
      supabase.from('study_plans').select('*').eq('user_id', user.id),
      supabase.from('poems').select('*').eq('user_id', user.id),
      supabase.from('playlists').select('*').eq('user_id', user.id),
      supabase.from('countdowns').select('*').eq('user_id', user.id),
    ]);

  const data = {
    exported_at: new Date().toISOString(),
    user_id: user.id,
    vocab_words: vocabResult.data ?? [],
    study_plans: studyPlansResult.data ?? [],
    poems: poemsResult.data ?? [],
    playlists: playlistsResult.data ?? [],
    countdowns: countdownsResult.data ?? [],
  };

  if (format === 'csv') {
    const lines: string[] = [];
    for (const [table, rows] of Object.entries(data)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      lines.push(`# ${table}`);
      const headers = Object.keys(rows[0]);
      lines.push(headers.join(','));
      for (const row of rows) {
        lines.push(
          headers
            .map((h) => {
              const val = (row as Record<string, unknown>)[h];
              const str = val == null ? '' : String(val);
              return str.includes(',') || str.includes('"') || str.includes('\n')
                ? `"${str.replace(/"/g, '""')}"`
                : str;
            })
            .join(','),
        );
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  return JSON.stringify(data, null, 2);
}
