'use server';

import { createClient } from '@/lib/supabase/server';

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
export type DataArchive = { exported_at: string; version: 1; tables: Partial<Record<DataTable, Record<string, unknown>[]>> };

export async function exportAllUserData(): Promise<DataArchive> {
  const { supabase, user } = await getAuthenticatedUser();
  const tables: Partial<Record<DataTable, Record<string, unknown>[]>> = {};
  await Promise.all(DATA_TABLES.map(async (table) => {
    const query = supabase.from(table).select('*');
    if (table === 'quiz_questions') {
      const { data: sessions } = await supabase.from('quiz_sessions').select('id').eq('user_id', user.id);
      const ids = (sessions ?? []).map((session) => session.id);
      tables[table] = ids.length ? ((await query.in('session_id', ids)).data ?? []) : [];
    } else {
      tables[table] = ((await query.eq('user_id', user.id)).data ?? []) as Record<string, unknown>[];
    }
  }));
  return { exported_at: new Date().toISOString(), version: 1, tables };
}

export async function previewDataImport(archive: DataArchive) {
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
