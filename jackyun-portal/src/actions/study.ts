'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { SyllabusSubject, SyllabusUnit, StudyConfig, MockRecord } from '@/types/study';

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
  revalidatePath('/study/tasks');
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
  revalidatePath('/study/tasks');
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
  revalidatePath('/study/tasks');
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
  revalidatePath('/study/tasks');
}

export async function createQuickTask(input: {
  title: string;
  dueDate?: string | null;
  estimatedMinutes?: number;
}) {
  const { supabase, user } = await getAuthenticatedUser();
  const title = input.title?.trim();
  if (!title || title.length > 140) throw new Error('任务名称需要 1–140 个字符');
  const estimatedMinutes = Math.min(360, Math.max(10, Math.round(input.estimatedMinutes ?? 25)));
  const dueDate = input.dueDate?.trim() || null;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('截止日期格式不正确');

  const { error } = await supabase.from('study_tasks').insert({
    user_id: user.id,
    plan_id: null,
    title,
    completed: false,
    due_date: dueDate,
    estimated_minutes: estimatedMinutes,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard');
  revalidatePath('/study/tasks');
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
    .update({
      completed: !task.completed,
      completed_at: task.completed ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  revalidatePath('/study');
  revalidatePath('/study/tasks');
}

export interface StudyFocusLaunch {
  focusTaskId: string;
  studyTaskId: string;
  title: string;
  durationMinutes: number;
}

export async function prepareStudyFocus(
  taskId: string,
  requestedDurationMinutes?: number,
): Promise<StudyFocusLaunch> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data: task, error: taskError } = await supabase
    .from('study_tasks')
    .select('id, title, completed, estimated_minutes')
    .eq('id', taskId)
    .eq('user_id', user.id)
    .single();

  if (taskError || !task) throw new Error('Task not found');
  if (task.completed) throw new Error('Completed tasks cannot start a new focus session');

  const durationMinutes = Math.min(
    90,
    Math.max(10, Math.round(requestedDurationMinutes ?? task.estimated_minutes ?? 25)),
  );
  const estimatedPomodoros = Math.max(1, Math.ceil((task.estimated_minutes ?? durationMinutes) / durationMinutes));
  const { data: focusTask, error: focusError } = await supabase
    .from('focus_tasks')
    .upsert({
      user_id: user.id,
      study_task_id: task.id,
      title: task.title,
      estimated_pomodoros: estimatedPomodoros,
      is_completed: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'study_task_id' })
    .select('id')
    .single();

  if (focusError || !focusTask) throw new Error(focusError?.message ?? 'Unable to prepare focus task');
  return {
    focusTaskId: focusTask.id,
    studyTaskId: task.id,
    title: task.title,
    durationMinutes,
  };
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
  revalidatePath('/study/tasks');
}

// ── Syllabus ──────────────────────────────────────────────────────────────────

export async function getSyllabus(): Promise<SyllabusSubject[]> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from('study_syllabus')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SyllabusSubject[];
}

export async function upsertSubject(
  subjectName: string,
  color: string,
  units: SyllabusUnit[],
): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  const { error } = await supabase.from('study_syllabus').upsert(
    {
      user_id: user.id,
      subject_name: subjectName,
      color,
      units,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,subject_name' },
  );
  if (error) throw new Error(error.message);
  revalidatePath('/study');
}

export async function updateStepDone(
  subjectName: string,
  unitIndex: number,
  stepIndex: number,
  done: boolean,
): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data, error: fetchError } = await supabase
    .from('study_syllabus')
    .select('units')
    .eq('user_id', user.id)
    .eq('subject_name', subjectName)
    .single();
  if (fetchError || !data) throw new Error('Subject not found');

  const units = data.units as SyllabusUnit[];
  if (!units[unitIndex]?.steps[stepIndex]) throw new Error('Step not found');
  units[unitIndex].steps[stepIndex].done = done;

  const { error } = await supabase
    .from('study_syllabus')
    .update({ units, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('subject_name', subjectName);
  if (error) throw new Error(error.message);
  revalidatePath('/study');
}

export async function deleteSubject(subjectName: string): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  const { error } = await supabase
    .from('study_syllabus')
    .delete()
    .eq('user_id', user.id)
    .eq('subject_name', subjectName);
  if (error) throw new Error(error.message);
  revalidatePath('/study');
}

// ── Config ────────────────────────────────────────────────────────────────────

export async function getStudyConfig(): Promise<StudyConfig> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data } = await supabase
    .from('study_config')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (!data) {
    return {
      school_date: null,
      exam_date: null,
      emergency_subjects: [],
      emergency_deadline: null,
      emergency_note: null,
    };
  }
  return {
    school_date: data.school_date ?? null,
    exam_date: data.exam_date ?? null,
    emergency_subjects: data.emergency_subjects ?? [],
    emergency_deadline: data.emergency_deadline ?? null,
    emergency_note: data.emergency_note ?? null,
  };
}

export async function updateStudyConfig(config: Partial<StudyConfig>): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  const { error } = await supabase.from('study_config').upsert(
    {
      user_id: user.id,
      ...config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(error.message);
  revalidatePath('/study');
}

// ── Mock Records ──────────────────────────────────────────────────────────────

export async function addMockRecord(
  record: Omit<MockRecord, 'id' | 'created_at'>,
): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();
  const { error } = await supabase.from('study_mock_records').insert({
    user_id: user.id,
    ...record,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/study');
}

export async function getMockRecords(): Promise<MockRecord[]> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from('study_mock_records')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MockRecord[];
}
