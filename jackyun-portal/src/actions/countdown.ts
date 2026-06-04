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

export async function addCountdown(formData: FormData) {
  const { supabase, user } = await getAuthenticatedUser();

  const title = (formData.get('title') as string)?.trim();
  const target_date = (formData.get('target_date') as string)?.trim();
  const description = (formData.get('description') as string)?.trim() || null;
  const color = (formData.get('color') as string) || '#4285F4';

  if (!title) throw new Error('Title is required');
  if (!target_date) throw new Error('Target date is required');

  const { error } = await supabase.from('countdowns').insert({
    user_id: user.id,
    title,
    target_date,
    description,
    color,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/countdown');
}

export async function deleteCountdown(id: string) {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase
    .from('countdowns')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/countdown');
}

export async function updateCountdown(
  id: string,
  data: { title?: string; target_date?: string; color?: string; description?: string }
): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase
    .from('countdowns')
    .update(data)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/countdown');
}

export async function reorderCountdowns(items: { id: string; sort_order: number }[]): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();

  for (const item of items) {
    const { error } = await supabase
      .from('countdowns')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id)
      .eq('user_id', user.id);
    if (error) throw new Error(error.message);
  }

  revalidatePath('/countdown');
}

export async function addCountdownBatch(
  events: { title: string; target_date: string; color: string; description: string | null; sort_order: number }[]
): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();

  const rows = events.map((e) => ({ ...e, user_id: user.id }));
  const { error } = await supabase.from('countdowns').insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath('/countdown');
}
