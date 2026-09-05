import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import CreatePlanDialog from '@/components/modules/study/create-plan-dialog';
import PlanList from '@/components/modules/study/plan-list';
import TaskInbox from '@/components/modules/study/task-inbox';
import type { StudyPlanWithTasks } from '@/types';

export const metadata = { title: '学习任务 · JackYun Portal' };

export default async function StudyTasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="page-enter mx-auto max-w-4xl py-16 text-center">
        <span className="material-icons-round text-5xl text-[#1a73e8]">cloud_off</span>
        <h1 className="mt-4 text-2xl font-semibold">登录后使用云端学习任务</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">游客仍可继续使用旧版学习计划；登录后可以把任务与番茄钟、统计和复习计划连接起来。</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/study" className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm font-semibold">返回学习计划</Link>
          <Link href="/login" className="rounded-lg bg-[#1a73e8] px-4 py-2 text-sm font-semibold text-white">前往登录</Link>
        </div>
      </div>
    );
  }

  const [{ data, error }, { data: inboxTasks, error: inboxError }] = await Promise.all([
    supabase
      .from('study_plans')
      .select('id, user_id, title, description, start_date, end_date, created_at, updated_at, tasks:study_tasks(id, user_id, plan_id, title, completed, due_date, subject, estimated_minutes, priority, scheduled_at, completed_at, created_at, updated_at)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('study_tasks')
      .select('id, title, completed, due_date, estimated_minutes')
      .eq('user_id', user.id)
      .is('plan_id', null)
      .order('created_at', { ascending: false }),
  ]);

  if (error || inboxError) throw new Error(error?.message ?? inboxError?.message);
  const plans = (data ?? []) as StudyPlanWithTasks[];

  return (
    <div className="page-enter mx-auto max-w-6xl pb-12">
      <header className="flex flex-col gap-5 border-b border-[var(--card-border)] pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/study" className="text-xs font-semibold text-[#1a73e8] hover:underline">← 返回学习计划</Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">云端学习任务</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">这里的任务可以直接启动番茄钟，并把专注记录关联到具体学习目标。</p>
        </div>
        <CreatePlanDialog />
      </header>
      <div className="mt-7">
        <TaskInbox tasks={inboxTasks ?? []} />
        <PlanList plans={plans} />
      </div>
    </div>
  );
}
