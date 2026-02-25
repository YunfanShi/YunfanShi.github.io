'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

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
  data: { word?: string; meaning?: string; category?: string },
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
