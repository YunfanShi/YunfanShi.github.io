'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type PomodoroSettings = {
  pomodoroMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakInterval: number;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
};

export type PomodoroTask = {
  id: string;
  text: string;
  estimated: number;
  completed: boolean;
  donePomodoros: number;
};

const DEFAULT_SETTINGS: PomodoroSettings = {
  pomodoroMin: 25, shortBreakMin: 5, longBreakMin: 15, longBreakInterval: 4,
  soundEnabled: true, notificationsEnabled: true,
};

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return { supabase, user };
}

export async function getPomodoroWorkspace(): Promise<{ tasks: PomodoroTask[]; settings: PomodoroSettings; completedToday: number }> {
  const { supabase, user } = await currentUser();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [tasksResult, settingsResult, sessionsResult] = await Promise.all([
    supabase.from('focus_tasks').select('*').eq('user_id', user.id).order('created_at'),
    supabase.from('focus_settings').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('focus_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('completed_at', today.toISOString()),
  ]);
  if (tasksResult.error) throw new Error(tasksResult.error.message);
  if (settingsResult.error) throw new Error(settingsResult.error.message);
  if (sessionsResult.error) throw new Error(sessionsResult.error.message);
  const row = settingsResult.data;
  return {
    tasks: (tasksResult.data ?? []).map((task) => ({ id: task.id, text: task.title, estimated: task.estimated_pomodoros, completed: task.is_completed, donePomodoros: task.completed_pomodoros })),
    settings: row ? { pomodoroMin: row.pomodoro_min, shortBreakMin: row.short_break_min, longBreakMin: row.long_break_min, longBreakInterval: row.long_break_interval, soundEnabled: row.sound_enabled, notificationsEnabled: row.notifications_enabled } : DEFAULT_SETTINGS,
    completedToday: sessionsResult.count ?? 0,
  };
}

export async function savePomodoroSettings(settings: PomodoroSettings) {
  const { supabase, user } = await currentUser();
  const { error } = await supabase.from('focus_settings').upsert({
    user_id: user.id, pomodoro_min: settings.pomodoroMin, short_break_min: settings.shortBreakMin,
    long_break_min: settings.longBreakMin, long_break_interval: settings.longBreakInterval,
    sound_enabled: settings.soundEnabled, notifications_enabled: settings.notificationsEnabled, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function createPomodoroTask(title: string) {
  const { supabase, user } = await currentUser();
  const { data, error } = await supabase.from('focus_tasks').insert({ user_id: user.id, title: title.trim() }).select().single();
  if (error) throw new Error(error.message);
  return { id: data.id, text: data.title, estimated: data.estimated_pomodoros, completed: data.is_completed, donePomodoros: data.completed_pomodoros } satisfies PomodoroTask;
}

export async function updatePomodoroTask(id: string, patch: Partial<Pick<PomodoroTask, 'estimated' | 'completed'>>) {
  const { supabase, user } = await currentUser();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.estimated !== undefined) payload.estimated_pomodoros = patch.estimated;
  if (patch.completed !== undefined) payload.is_completed = patch.completed;
  const { error } = await supabase.from('focus_tasks').update(payload).eq('id', id).eq('user_id', user.id);
  if (error) throw new Error(error.message);
}

export async function deletePomodoroTask(id: string) {
  const { supabase, user } = await currentUser();
  const { error } = await supabase.from('focus_tasks').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw new Error(error.message);
}

export async function completePomodoroSession(taskId: string | null, durationSeconds: number) {
  const { supabase, user } = await currentUser();
  const { error } = await supabase.from('focus_sessions').insert({ user_id: user.id, task_id: taskId, duration_seconds: durationSeconds });
  if (error) throw new Error(error.message);
  if (taskId) {
    const { data: task } = await supabase.from('focus_tasks').select('completed_pomodoros').eq('id', taskId).eq('user_id', user.id).maybeSingle();
    if (task) await supabase.from('focus_tasks').update({ completed_pomodoros: task.completed_pomodoros + 1, updated_at: new Date().toISOString() }).eq('id', taskId).eq('user_id', user.id);
  }
  revalidatePath('/pomodoro');
}
