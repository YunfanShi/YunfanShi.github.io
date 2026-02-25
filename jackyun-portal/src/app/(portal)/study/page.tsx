import { createClient } from '@/lib/supabase/server';
import CreatePlanDialog from '@/components/modules/study/create-plan-dialog';
import PlanList from '@/components/modules/study/plan-list';

interface Task {
  id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
}

interface StudyPlanWithTasks {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  tasks: Task[];
}

export default async function StudyPage() {
  const supabase = await createClient();

  const { data: plansData } = await supabase
    .from('study_plans')
    .select('id, title, description, start_date, end_date, created_at')
    .order('created_at', { ascending: false });

  const plans = plansData ?? [];

  let plansWithTasks: StudyPlanWithTasks[] = [];

  if (plans.length > 0) {
    const planIds = plans.map((p) => p.id);
    const { data: tasksData } = await supabase
      .from('study_tasks')
      .select('id, plan_id, title, completed, due_date')
      .in('plan_id', planIds)
      .order('created_at', { ascending: true });

    const tasksByPlan: Record<string, Task[]> = {};
    for (const task of tasksData ?? []) {
      if (!tasksByPlan[task.plan_id]) tasksByPlan[task.plan_id] = [];
      tasksByPlan[task.plan_id].push({
        id: task.id,
        title: task.title,
        completed: task.completed,
        due_date: task.due_date,
      });
    }

    plansWithTasks = plans.map((p) => ({
      ...p,
      tasks: tasksByPlan[p.id] ?? [],
    }));
  }

  const totalTasks = plansWithTasks.reduce((sum, p) => sum + p.tasks.length, 0);
  const completedTasks = plansWithTasks.reduce(
    (sum, p) => sum + p.tasks.filter((t) => t.completed).length,
    0,
  );

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)]">学习计划</h1>
          <p className="mt-1 text-[var(--muted-foreground)]">
            制定目标，逐步完成，成就更好的自己
          </p>
        </div>
        <CreatePlanDialog />
      </div>

      {/* Stats row */}
      {plansWithTasks.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-4 text-center">
            <p className="text-2xl font-bold text-[#4285F4]">{plansWithTasks.length}</p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">学习计划</p>
          </div>
          <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-4 text-center">
            <p className="text-2xl font-bold text-[#FBBC05]">{totalTasks}</p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">总任务数</p>
          </div>
          <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-4 text-center">
            <p className="text-2xl font-bold text-[#34A853]">{completedTasks}</p>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">已完成</p>
          </div>
        </div>
      )}

      <PlanList plans={plansWithTasks} />
    </div>
  );
}
