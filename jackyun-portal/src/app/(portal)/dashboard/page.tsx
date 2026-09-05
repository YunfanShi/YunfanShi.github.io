import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import ProductCard from '@/components/modules/product-card';
import { completionRate as calculateCompletionRate } from '@/lib/learning/metrics';
import { rankLearningCandidates } from '@/lib/learning/prioritization';
import { dateKey } from '@/lib/learning/timezone';
import StartStudyButton from '@/components/modules/study/start-study-button';
import QuickTaskForm from '@/components/modules/study/quick-task-form';

const MODULES = [
  {
    id: 'study',
    title: '学习计划',
    description: '制定并跟踪你的学习目标与每日任务',
    icon: 'school',
    color: '#4285F4',
    href: '/study',
  },
  {
    id: 'vocab',
    title: '词汇宝库',
    description: '高效积累与复习英语词汇',
    icon: 'menu_book',
    color: '#EA4335',
    href: '/vocab',
  },
  {
    id: 'music',
    title: '音乐播放器',
    description: '管理你的音乐播放列表',
    icon: 'music_note',
    color: '#FBBC05',
    href: '/music',
  },
  {
    id: 'poem',
    title: '诗词天地',
    description: '收录与背诵经典诗词',
    icon: 'auto_stories',
    color: '#34A853',
    href: '/poem',
  },
  {
    id: 'countdown',
    title: '倒计时',
    description: '重要日期倒计时提醒',
    icon: 'timer',
    color: '#4285F4',
    href: '/countdown',
  },
  {
    id: 'relax',
    title: '放松一下',
    description: '游戏与娱乐，给大脑放个假',
    icon: 'sports_esports',
    color: '#EA4335',
    href: '/relax',
  },
  {
    id: 'tools',
    title: '工具箱',
    description: '实用小工具集合',
    icon: 'build',
    color: '#FBBC05',
    href: '/tools',
  },
  {
    id: 'mock-portal',
    title: 'Mock 刷题',
    description: '真题刷题与考试模拟',
    icon: 'quiz',
    color: '#FBBC05',
    href: '/mock-portal',
  },
  {
    id: 'control',
    title: '控制中心',
    description: '系统控制与快捷设置',
    icon: 'tune',
    color: '#34A853',
    href: '/control',
  },
];

interface StatCardProps {
  icon: string;
  color: string;
  label: string;
  value: string | number;
}

function StatCard({ icon, color, label, value }: StatCardProps) {
  return (
    <div className="group flex items-center gap-4 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--surface-shadow)]">
      <div
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105"
        style={{ background: `${color}15`, color }}
      >
        <span className="material-icons-round text-xl">{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold tracking-[-0.04em] text-[var(--foreground)]">{value}</p>
        <p className="mt-0.5 text-xs font-medium text-[var(--muted-foreground)]">{label}</p>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const username =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.user_name as string | undefined) ??
    '用户';

  // Fetch stats
  const now = new Date();
  const today = dateKey(now, 'Asia/Shanghai');
  const todayStart = new Date(`${today}T00:00:00+08:00`).toISOString();
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 6);
  const [vocabResult, masteredResult, studyResult, companionResult, deviceResult, reviewResult, focusResult, countdownResult] = await Promise.all([
    supabase
      .from('vocab_words')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user?.id ?? ''),
    supabase
      .from('vocab_words')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user?.id ?? '')
      .eq('mastered', true),
    supabase
      .from('study_tasks')
      .select('id, title, completed, due_date, estimated_minutes, priority, scheduled_at, completed_at', { count: 'exact', head: false })
      .eq('user_id', user?.id ?? ''),
    supabase.from('companion_activity_daily').select('activity_date, hostname, category, active_seconds, visits').eq('user_id', user?.id ?? '').gte('activity_date', weekStart.toISOString().slice(0, 10)),
    supabase.from('companion_devices').select('id', { count: 'exact', head: true }).eq('user_id', user?.id ?? '').is('revoked_at', null),
    supabase.from('review_items').select('id', { count: 'exact', head: true }).eq('user_id', user?.id ?? '').eq('status', 'active').lte('next_review_at', now.toISOString()),
    supabase.from('focus_sessions').select('duration_seconds').eq('user_id', user?.id ?? '').gte('completed_at', todayStart),
    supabase.from('countdowns').select('title, target_date').eq('user_id', user?.id ?? '').gte('target_date', today).order('target_date').limit(1).maybeSingle(),
  ]);

  const totalVocab = vocabResult.count ?? 0;
  const masteredVocab = masteredResult.count ?? 0;
  const tasks = studyResult.data ?? [];
  const completedTasks = tasks.filter((t) => t.completed).length;
  const completionRate = calculateCompletionRate(tasks);
  const todayKey = today;
  const nextTasks = rankLearningCandidates(
    tasks
      .filter((task) => !task.completed)
      .map((task) => ({
        ...task,
        dueDate: task.due_date,
        priority: task.priority ?? 3,
      })),
    todayKey,
  ).slice(0, 4);
  const companionRows = companionResult.data ?? [];
  const companionTodaySeconds = companionRows.filter((row) => row.activity_date === today).reduce((sum, row) => sum + Number(row.active_seconds || 0), 0);
  const companionWeekSeconds = companionRows.reduce((sum, row) => sum + Number(row.active_seconds || 0), 0);
  const todayTasks = tasks.filter((task) => {
    if (task.due_date === today) return true;
    if (!task.scheduled_at) return false;
    return dateKey(new Date(task.scheduled_at), 'Asia/Shanghai') === today;
  });
  const todayCompleted = tasks.filter((task) => task.completed_at && dateKey(new Date(task.completed_at), 'Asia/Shanghai') === today).length;
  const focusTodayMinutes = Math.round((focusResult.data ?? []).reduce((sum, session) => sum + Number(session.duration_seconds || 0), 0) / 60);
  const nextCountdown = countdownResult.data;
  const countdownDays = nextCountdown ? Math.max(0, Math.ceil((Date.parse(`${nextCountdown.target_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)) : null;

  return (
    <div className="page-enter mx-auto max-w-[1440px]">
      <section className="mb-10 border-b border-[var(--card-border)] pb-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Your learning space</p>
            <h1 className="text-3xl font-medium tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">你好，{username}</h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">让每一次专注都有迹可循，把学习、计划与灵感沉淀为你的长期能力。</p>
          </div>
          <Link href="/study" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1a73e8] px-4 text-sm font-medium text-white transition-colors hover:bg-[#185abc] dark:bg-[#8ab4f8] dark:text-[#202124] dark:hover:bg-[#aecbfa]">
            继续学习 <span className="material-icons-round text-lg">arrow_forward</span>
          </Link>
        </div>
      </section>

      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Progress overview</p>
          <h2 className="mt-1 text-xl font-medium tracking-[-0.025em] text-[var(--foreground)]">学习概览</h2>
        </div>
        <p className="hidden text-sm text-[var(--muted-foreground)] sm:block">小步积累，持续靠近目标</p>
      </div>

      {/* Stats */}
      <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard icon="menu_book" color="#EA4335" label="词汇总数" value={totalVocab} />
        <StatCard icon="check_circle" color="#34A853" label="已掌握词汇" value={masteredVocab} />
        <StatCard icon="task_alt" color="#4285F4" label={`全部任务完成率（${completedTasks}/${tasks.length}）`} value={`${completionRate}%`} />
      </div>

      <section className="mb-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/study/tasks" className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 transition-transform hover:-translate-y-0.5">
          <p className="text-xs text-[var(--muted-foreground)]">今日任务</p>
          <strong className="mt-2 block text-2xl">{todayCompleted}/{todayTasks.length}</strong>
          <span className="mt-2 block text-xs text-[#1a73e8]">查看和开始任务 →</span>
        </Link>
        <Link href="/review" className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 transition-transform hover:-translate-y-0.5">
          <p className="text-xs text-[var(--muted-foreground)]">到期错题复习</p>
          <strong className="mt-2 block text-2xl">{reviewResult.count ?? 0}</strong>
          <span className="mt-2 block text-xs text-[#1a73e8]">开始复习 →</span>
        </Link>
        <Link href="/pomodoro" className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 transition-transform hover:-translate-y-0.5">
          <p className="text-xs text-[var(--muted-foreground)]">今日专注</p>
          <strong className="mt-2 block text-2xl">{focusTodayMinutes}m</strong>
          <span className="mt-2 block text-xs text-[#1a73e8]">打开番茄钟 →</span>
        </Link>
        <Link href="/countdown" className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 transition-transform hover:-translate-y-0.5">
          <p className="truncate text-xs text-[var(--muted-foreground)]">{nextCountdown?.title ?? '最近倒计日'}</p>
          <strong className="mt-2 block text-2xl">{countdownDays == null ? '—' : `${countdownDays}天`}</strong>
          <span className="mt-2 block text-xs text-[#1a73e8]">管理重要日期 →</span>
        </Link>
      </section>

      {user && (
        <section className="mb-10">
          <div className="mb-3 flex items-end justify-between">
            <div><p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Quick capture</p><h2 className="mt-1 text-lg font-medium">快速收集</h2></div>
          </div>
          <QuickTaskForm />
        </section>
      )}

      <section className="mb-10 overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--surface-shadow)]">
        <div className="flex flex-col gap-3 border-b border-[var(--card-border)] p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#1a73e8]">Next action</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-.025em]">接下来学什么</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">按照截止时间与任务优先级排序，点击后直接进入专注计时。</p>
          </div>
          <Link href="/study/tasks" className="text-sm font-semibold text-[#1a73e8] hover:underline">管理云端任务</Link>
        </div>
        {nextTasks.length > 0 ? (
          <ol className="divide-y divide-[var(--card-border)]">
            {nextTasks.map(({ item: task, reasons }, index) => (
              <li key={task.id} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--background)] text-xs font-bold text-[var(--muted-foreground)]">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-[var(--foreground)]">{task.title}</strong>
                  <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                    {reasons.length > 0 ? reasons.join(' · ') : '计划中的待完成任务'} · 预计 {task.estimated_minutes ?? 25} 分钟
                  </span>
                </div>
                <StartStudyButton taskId={task.id} durationMinutes={task.estimated_minutes ?? 25} />
              </li>
            ))}
          </ol>
        ) : (
          <div className="p-8 text-center">
            <span className="material-icons-round text-3xl text-[#34a853]">task_alt</span>
            <p className="mt-2 text-sm font-medium">当前没有待完成的云端学习任务</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">新建学习计划后，这里会自动推荐下一项。</p>
          </div>
        )}
      </section>

      <section className="mb-10 overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--surface-shadow)]">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_1fr] lg:p-7"><div><div className="flex items-center gap-3"><span className="material-icons-round grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f0fe] text-[#1a73e8]">devices</span><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--muted-foreground)]">JackYun Companion</p><h2 className="text-xl font-semibold">浏览器学习活动</h2></div></div><p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted-foreground)]">跨学习网站记录有效时间，只保存域名级聚合。扩展离线时会在恢复网络后继续同步。</p><Link href="/activity" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#1a73e8] px-4 py-2.5 text-sm font-semibold text-white">查看完整活动报告<span className="material-icons-round text-lg">arrow_forward</span></Link></div><div className="grid grid-cols-3 gap-3"><div className="rounded-2xl bg-[var(--background)] p-4"><p className="text-xs text-[var(--muted-foreground)]">今日</p><strong className="mt-2 block text-2xl">{Math.round(companionTodaySeconds / 60)}m</strong></div><div className="rounded-2xl bg-[var(--background)] p-4"><p className="text-xs text-[var(--muted-foreground)]">七日</p><strong className="mt-2 block text-2xl">{Math.round(companionWeekSeconds / 3600 * 10) / 10}h</strong></div><div className="rounded-2xl bg-[var(--background)] p-4"><p className="text-xs text-[var(--muted-foreground)]">设备</p><strong className="mt-2 block text-2xl">{deviceResult.count ?? 0}</strong></div></div></div>
      </section>

      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">All tools</p>
          <h2 className="mt-1 text-xl font-medium tracking-[-0.025em] text-[var(--foreground)]">探索你的工作台</h2>
        </div>
        <span className="text-sm text-[var(--muted-foreground)]">{MODULES.length} 个模块</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MODULES.map((mod) => (
          <ProductCard key={mod.id} {...mod} />
        ))}
      </div>
    </div>
  );
}
