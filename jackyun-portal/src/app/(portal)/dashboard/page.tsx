import { createClient } from '@/lib/supabase/server';
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
    <div className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-4 flex items-center gap-4">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}15`, color }}
      >
        <span className="material-icons-round text-xl">{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-[var(--foreground)]">{value}</p>
        <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
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
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">
          你好，{username} 👋
        </h1>
        <p className="mt-1 text-[var(--muted-foreground)]">
          欢迎回到你的个人门户
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <StatCard icon="menu_book" color="#EA4335" label="词汇总数" value={totalVocab} />
        <StatCard icon="check_circle" color="#34A853" label="已掌握词汇" value={masteredVocab} />
        <StatCard icon="task_alt" color="#4285F4" label="任务完成率" value={`${completionRate}%`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {MODULES.map((mod) => (
          <ProductCard key={mod.id} {...mod} />
        ))}
      </div>
    </div>
  );
}
