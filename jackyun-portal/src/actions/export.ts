'use server';

import { createClient } from '@/lib/supabase/server';
import { createHash } from 'node:crypto';
import type { DataArchiveV2 } from '@/types/sync';
import { canonicalJson } from '@/lib/sync/hash';

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return { supabase, user };
}

const DATA_TABLES = ['vocab_words', 'vocab_stats', 'vocab_settings', 'study_plans', 'study_tasks', 'study_syllabus', 'study_config', 'study_mock_records', 'poems', 'poem_sessions', 'playlists', 'tracks', 'music_songs', 'music_settings', 'countdowns', 'quiz_subjects', 'quiz_sessions', 'quiz_questions', 'quiz_settings', 'relax_chat', 'relax_state', 'focus_settings', 'focus_tasks', 'focus_sessions', 'user_settings', 'legacy_sync_data'] as const;
type DataTable = typeof DATA_TABLES[number];
export type DataArchiveV1 = { exported_at: string; version: 1; tables: Partial<Record<DataTable, Record<string, unknown>[]>> };
export type DataArchive = DataArchiveV1 | DataArchiveV2<DataTable>;

function checksum(tables: DataArchive['tables']): string {
  return createHash('sha256').update(canonicalJson(tables)).digest('hex');
}

function assertValidArchive(archive: DataArchive) {
  if (!archive || !archive.tables || (archive.version !== 1 && archive.version !== 2)) throw new Error('Unsupported backup format');
  if (archive.version === 2 && archive.checksum !== checksum(archive.tables)) throw new Error('Backup checksum mismatch');
}

export async function exportAllUserData(): Promise<DataArchiveV2<DataTable>> {
  const { supabase, user } = await getAuthenticatedUser();
  const tables: Partial<Record<DataTable, Record<string, unknown>[]>> = {};
  await Promise.all(DATA_TABLES.map(async (table) => {
    const query = supabase.from(table).select('*');
    if (table === 'quiz_questions') {
      const { data: sessions, error: sessionsError } = await supabase.from('quiz_sessions').select('id').eq('user_id', user.id);
      if (sessionsError) throw new Error(`quiz_sessions: ${sessionsError.message}`);
      const ids = (sessions ?? []).map((session) => session.id);
      if (!ids.length) {
        tables[table] = [];
        return;
      }
      const { data, error } = await query.in('session_id', ids);
      if (error) throw new Error(`${table}: ${error.message}`);
      tables[table] = data ?? [];
    } else {
      const { data, error } = await query.eq('user_id', user.id);
      if (error) throw new Error(`${table}: ${error.message}`);
      tables[table] = data ?? [];
    }
  }));
  return { exported_at: new Date().toISOString(), version: 2, schema_version: 'sync-v2', checksum: checksum(tables), tables };
}

export async function previewDataImport(archive: DataArchive) {
  assertValidArchive(archive);
  const { supabase, user } = await getAuthenticatedUser();
  return Promise.all(DATA_TABLES.filter((table) => Array.isArray(archive.tables?.[table])).map(async (table) => {
    const incoming = archive.tables?.[table] ?? [];
    const local = table === 'quiz_questions'
      ? 0
      : (await supabase.from(table).select('*', { count: 'exact', head: true }).eq('user_id', user.id)).count ?? 0;
    return { table, incoming: incoming.length, local, changed: incoming.length > 0 };
  }));
}

export async function importSelectedData(archive: DataArchive, selected: DataTable[]): Promise<{ imported: string[]; skipped: string[] }> {
  assertValidArchive(archive);
  const { supabase, user } = await getAuthenticatedUser();
  const imported: string[] = []; const skipped: string[] = [];
  for (const table of selected) {
    if (!DATA_TABLES.includes(table) || !Array.isArray(archive.tables?.[table])) { skipped.push(table); continue; }
    const rows = archive.tables[table] ?? [];
    if (!rows.length) { skipped.push(table); continue; }
    const prepared = rows.map((row) => table === 'quiz_questions' ? row : { ...row, user_id: user.id });
    const { error } = await supabase.from(table).upsert(prepared);
    if (error) throw new Error(`${table}: ${error.message}`);
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
