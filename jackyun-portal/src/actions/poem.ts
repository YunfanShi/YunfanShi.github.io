'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { PoemSession } from '@/types/poem';

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return { supabase, user };
}

export async function addPoem(formData: FormData) {
  const { supabase, user } = await getAuthenticatedUser();

  const title = (formData.get('title') as string)?.trim();
  const author = (formData.get('author') as string)?.trim() || null;
  const content = (formData.get('content') as string)?.trim();

  if (!title) throw new Error('Title is required');
  if (!content) throw new Error('Content is required');

  const { error } = await supabase.from('poems').insert({
    user_id: user.id,
    title,
    author,
    content,
    mastery_level: 0,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/poem');
}

export async function updatePoem(
  id: string,
  data: { title?: string; author?: string; content?: string },
) {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase
    .from('poems')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/poem');
}

export async function deletePoem(id: string) {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase
    .from('poems')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/poem');
}

export async function savePoemSession(
  poemId: string,
  session: { timeSeconds: number; retreats: number; studyModeUsed: boolean },
): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();

  const { error: insertError } = await supabase.from('poem_sessions').insert({
    user_id: user.id,
    poem_id: poemId,
    time_seconds: session.timeSeconds,
    retreats: session.retreats,
    study_mode_used: session.studyModeUsed,
    completed: true,
  });
  if (insertError) throw new Error(insertError.message);

  // Update best_time and completion_count on the poem
  const { data: poem } = await supabase
    .from('poems')
    .select('best_time, completion_count')
    .eq('id', poemId)
    .eq('user_id', user.id)
    .single();

  const currentBest: number | null = poem?.best_time ?? null;
  const newBest =
    currentBest === null || session.timeSeconds < currentBest ? session.timeSeconds : currentBest;

  const { error: updateError } = await supabase
    .from('poems')
    .update({
      best_time: newBest,
      completion_count: (poem?.completion_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', poemId)
    .eq('user_id', user.id);

  if (updateError) throw new Error(updateError.message);
  revalidatePath('/poem');
}

export async function getPoemSessions(poemId: string): Promise<PoemSession[]> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from('poem_sessions')
    .select('id, poem_id, time_seconds, retreats, study_mode_used, completed, created_at')
    .eq('poem_id', poemId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PoemSession[];
}

export async function updateMastery(id: string, masteryLevel: number) {
  const { supabase, user } = await getAuthenticatedUser();

  const level = Math.max(0, Math.min(5, masteryLevel));

  const { error } = await supabase
    .from('poems')
    .update({ mastery_level: level, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/poem');
}
