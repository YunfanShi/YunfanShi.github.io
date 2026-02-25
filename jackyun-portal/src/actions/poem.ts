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
