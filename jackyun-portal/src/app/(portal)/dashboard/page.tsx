import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import ProductCard from '@/components/modules/product-card';

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
  {
    id: 'admin',
    title: '管理员',
    description: '系统管理与配置',
    icon: 'admin_panel_settings',
    color: '#34A853',
    href: '/admin',
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
  const [vocabResult, masteredResult, studyResult] = await Promise.all([
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
      .select('completed', { count: 'exact', head: false })
      .eq('user_id', user?.id ?? ''),
  ]);

  const totalVocab = vocabResult.count ?? 0;
  const masteredVocab = masteredResult.count ?? 0;
  const tasks = studyResult.data ?? [];
  const completedTasks = tasks.filter((t) => t.completed).length;
  const completionRate =
    tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

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
          <h2 className="mt-1 text-xl font-medium tracking-[-0.025em] text-[var(--foreground)]">今日进度</h2>
        </div>
        <p className="hidden text-sm text-[var(--muted-foreground)] sm:block">小步积累，持续靠近目标</p>
      </div>

      {/* Stats */}
      <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard icon="menu_book" color="#EA4335" label="词汇总数" value={totalVocab} />
        <StatCard icon="check_circle" color="#34A853" label="已掌握词汇" value={masteredVocab} />
        <StatCard icon="task_alt" color="#4285F4" label="任务完成率" value={`${completionRate}%`} />
      </div>

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
