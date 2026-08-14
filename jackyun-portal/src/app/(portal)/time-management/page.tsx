'use client';

import Link from 'next/link';

interface ToolCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  emoji: string;
  color: string;
  bgColor: string;
  href: string;
}

const TOOLS: ToolCard[] = [
  {
    id: 'pomodoro',
    title: '番茄钟',
    description: '任务绑定 · 云端同步 · 专注数据沉淀',
    icon: 'lunch_dining',
    emoji: '🍅',
    color: '#d93025',
    bgColor: '#fce8e6',
    href: '/pomodoro',
  },
  {
    id: 'exam-countdown',
    title: '倒计时',
    description: '考试倒计时 · 备考冲刺',
    icon: 'hourglass_empty',
    emoji: '⏳',
    color: '#1a73e8',
    bgColor: '#e8f0fe',
    href: '/examcountdown',
  },
  {
    id: 'count-down',
    title: '倒计日',
    description: '重要日期 · 天数记录',
    icon: 'event_available',
    emoji: '📅',
    color: '#188038',
    bgColor: '#e6f4ea',
    href: '/countdown',
  },
];

export default function TimeManagementPage() {
  return (
    <div className="page-enter mx-auto max-w-[1280px]">
      <section className="mb-10 border-b border-[var(--card-border)] pb-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Focus with intention</p>
          <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">时间管理</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">把专注、冲刺与重要时刻放进同一个节奏里，让每一段时间都更有价值。</p>
        </div>
      </section>

      {/* Tool cards */}
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Choose your rhythm</p>
          <h2 className="mt-1 text-xl font-medium tracking-[-0.025em] text-[var(--foreground)]">选择计时方式</h2>
        </div>
        <span className="text-sm text-[var(--muted-foreground)]">3 个工具 · 已同步</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Link
            key={tool.id}
            href={tool.href}
            className="group relative min-h-56 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--surface-shadow)]"
          >
            {/* Icon */}
            <div
              className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105"
              style={{ background: tool.bgColor }}
            >
              <span className="material-icons-round text-3xl" style={{ color: tool.color }}>
                {tool.icon}
              </span>
            </div>

            {/* Title */}
            <h2 className="mb-2 text-lg font-medium text-[var(--foreground)]">
              {tool.title}
            </h2>

            {/* Description */}
            <p className="text-sm text-[var(--muted-foreground)]">
              {tool.description}
            </p>

            {/* Arrow */}
            <div className="absolute right-5 top-5 grid h-8 w-8 place-items-center rounded-lg bg-[#f1f3f4] text-[var(--foreground)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:bg-[#3c4043]">
              <span className="material-icons-round text-base">arrow_forward</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Bottom note */}
      <div className="mt-8 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">A small reminder</p>
        <h3 className="mt-2 text-base font-medium text-[var(--foreground)]">让计划服务于行动</h3>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          使用番茄钟保持专注，使用倒计时冲刺备考，使用倒计日记录重要日子。番茄任务、设置和今日专注记录会随账户同步。
          以上工具的侧边栏入口已统一收纳到这里。
        </p>
      </div>
    </div>
  );
}
