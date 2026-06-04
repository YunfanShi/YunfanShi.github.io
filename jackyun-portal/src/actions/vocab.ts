'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { VocabWordSRS, VocabDayStats, VocabSettings, ImportWordData } from '@/types/vocab';

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return { supabase, user };
}

export async function addWord(formData: FormData) {
  const { supabase, user } = await getAuthenticatedUser();

  const word = (formData.get('word') as string)?.trim();
  const meaning = (formData.get('meaning') as string)?.trim();
  const category = (formData.get('category') as string) || null;

  if (!word) throw new Error('Word is required');
  if (!meaning) throw new Error('Meaning is required');

  const { error } = await supabase.from('vocab_words').insert({
    user_id: user.id,
    word,
    meaning,
    category,
    mastered: false,
    review_count: 0,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/vocab');
}

export async function addWordsBatch(
  words: { word: string; meaning: string; category?: string }[],
) {
  const { supabase, user } = await getAuthenticatedUser();

  if (!words.length) return;

  const rows = words.map(({ word, meaning, category }) => ({
    user_id: user.id,
    word: word.trim(),
    meaning: meaning.trim(),
    category: category ?? null,
    mastered: false,
    review_count: 0,
  }));

  const { error } = await supabase.from('vocab_words').insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath('/vocab');
}

export async function toggleMastered(wordId: string) {
  const { supabase, user } = await getAuthenticatedUser();

  const { data: word, error: fetchError } = await supabase
    .from('vocab_words')
    .select('mastered')
    .eq('id', wordId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !word) throw new Error('Word not found');

  const { error } = await supabase
    .from('vocab_words')
    .update({ mastered: !word.mastered, updated_at: new Date().toISOString() })
    .eq('id', wordId)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/vocab');
}

export async function deleteWord(wordId: string) {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase
    .from('vocab_words')
    .delete()
    .eq('id', wordId)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/vocab');
}

export async function updateWord(
  wordId: string,
  data: { word?: string; meaning?: string; category?: string; ex?: string; cn?: string },
) {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase
    .from('vocab_words')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', wordId)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/vocab');
}

// ─── SRS-specific actions ──────────────────────────────────────────────────

export async function getAllWords(): Promise<VocabWordSRS[]> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from('vocab_words')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((w) => ({
    ...w,
    ex: w.ex ?? '',
    cn: w.cn ?? '',
    status: w.status ?? 'new',
    stage: w.stage ?? 0,
    next_review: w.next_review ?? 0,
    interval_minutes: w.interval_minutes ?? 0,
    learned_date: w.learned_date ?? null,
  })) as VocabWordSRS[];
}

export async function updateWordSRS(
  id: string,
  updates: Partial<VocabWordSRS>,
): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  const { error } = await supabase
    .from('vocab_words')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);
}

export async function importWords(words: ImportWordData[]): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!words.length) return;
  const rows = words.map(({ word, meaning, ex, cn, category }) => ({
    user_id: user.id,
    word: word.trim(),
    meaning: meaning.trim(),
    ex: ex?.trim() ?? '',
    cn: cn?.trim() ?? '',
    category: category ?? null,
    status: 'new',
    stage: 0,
    next_review: 0,
    interval_minutes: 0,
  }));
  const { error } = await supabase.from('vocab_words').insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath('/vocab');
}

export async function addSingleWord(data: ImportWordData): Promise<VocabWordSRS> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data: row, error } = await supabase
    .from('vocab_words')
    .insert({
      user_id: user.id,
      word: data.word.trim(),
      meaning: data.meaning.trim(),
      ex: data.ex?.trim() ?? '',
      cn: data.cn?.trim() ?? '',
      category: data.category ?? null,
      status: 'new',
      stage: 0,
      next_review: 0,
      interval_minutes: 0,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return row as VocabWordSRS;
}

export async function getTodayStats(): Promise<VocabDayStats> {
  const { supabase, user } = await getAuthenticatedUser();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('vocab_stats')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) {
    return {
      today_time: data.today_time,
      today_learned: data.today_learned,
      today_reviewed: data.today_reviewed,
      date: data.date,
    };
  }
  // Create default row
  const { data: inserted, error: insErr } = await supabase
    .from('vocab_stats')
    .insert({ user_id: user.id, date: today, today_time: 0, today_learned: 0, today_reviewed: 0 })
    .select()
    .single();
  if (insErr) throw new Error(insErr.message);
  return { today_time: 0, today_learned: 0, today_reviewed: 0, date: today };
}

export async function updateTodayStats(stats: Partial<VocabDayStats>): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('vocab_stats')
    .upsert(
      { user_id: user.id, date: today, ...stats, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date' },
    );
  if (error) throw new Error(error.message);
}

export async function getVocabSettings(): Promise<VocabSettings> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from('vocab_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return { tts: data.tts, rate: data.rate, theme: data.theme as VocabSettings['theme'] };
  // Create defaults
  await supabase
    .from('vocab_settings')
    .insert({ user_id: user.id, tts: true, rate: 1.0, theme: 'light' });
  return { tts: true, rate: 1.0, theme: 'light' };
}

export async function updateVocabSettings(settings: Partial<VocabSettings>): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  const { error } = await supabase
    .from('vocab_settings')
    .upsert(
      { user_id: user.id, ...settings, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(error.message);
}
