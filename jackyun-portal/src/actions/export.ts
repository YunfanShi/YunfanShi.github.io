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
