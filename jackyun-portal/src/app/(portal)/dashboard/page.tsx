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
    id: 'admin',
    title: '管理员',
    description: '系统管理与配置',
    icon: 'admin_panel_settings',
    color: '#34A853',
    href: '/admin',
  },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const username =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.user_name as string | undefined) ??
    '用户';

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {MODULES.map((mod) => (
          <ProductCard key={mod.id} {...mod} />
        ))}
      </div>
    </div>
  );
}
