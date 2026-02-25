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

export async function createPlan(formData: FormData) {
  const { supabase, user } = await getAuthenticatedUser();

  const title = formData.get('title') as string;
  const description = (formData.get('description') as string) || null;
  const start_date = (formData.get('start_date') as string) || null;
  const end_date = (formData.get('end_date') as string) || null;

  if (!title?.trim()) throw new Error('Title is required');

  const { error } = await supabase.from('study_plans').insert({
    user_id: user.id,
    title: title.trim(),
    description,
    start_date,
    end_date,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/study');
}

export async function updatePlan(
  id: string,
  data: { title?: string; description?: string },
) {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase
    .from('study_plans')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/study');
}

export async function deletePlan(id: string) {
  const { supabase, user } = await getAuthenticatedUser();

  // Delete associated tasks first
  await supabase
    .from('study_tasks')
    .delete()
    .eq('plan_id', id)
    .eq('user_id', user.id);

  const { error } = await supabase
    .from('study_plans')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/study');
}

export async function createTask(planId: string, title: string) {
  const { supabase, user } = await getAuthenticatedUser();

  if (!title?.trim()) throw new Error('Task title is required');

  const { error } = await supabase.from('study_tasks').insert({
    user_id: user.id,
    plan_id: planId,
    title: title.trim(),
    completed: false,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/study');
}

export async function toggleTask(taskId: string) {
  const { supabase, user } = await getAuthenticatedUser();

  const { data: task, error: fetchError } = await supabase
    .from('study_tasks')
    .select('completed')
    .eq('id', taskId)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !task) throw new Error('Task not found');

  const { error } = await supabase
    .from('study_tasks')
    .update({ completed: !task.completed, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/study');
}

export async function deleteTask(taskId: string) {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase
    .from('study_tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/study');
}
