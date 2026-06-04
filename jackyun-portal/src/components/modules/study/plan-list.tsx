'use client';

import PlanCard from './plan-card';

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

interface PlanListProps {
  plans: StudyPlanWithTasks[];
}

export default function PlanList({ plans }: PlanListProps) {
  if (plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-[var(--card-border)] py-20 text-center">
        <span className="material-icons-round text-5xl text-[var(--muted-foreground)] mb-4">
          school
        </span>
        <h3 className="text-base font-semibold text-[var(--foreground)]">还没有学习计划</h3>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          点击「新建计划」开始制定你的第一个学习目标
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} />
      ))}
    </div>
  );
}
