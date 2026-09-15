import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '记忆 Memory · JackYun',
  description: '把定义、语文背诵与性质对比集中在一个记忆空间。',
};

const TOOLS = [
  {
    id: 'definitions',
    title: 'Definitions',
    description: '抽认卡、测试与间隔复习，记住术语和定义。',
    icon: 'style',
    color: '#175cd3',
    background: '#eaf2ff',
    href: '/definitions',
  },
  {
    id: 'poem',
    title: '语文背诵',
    description: '收录诗词与课文，遮挡内容进行沉浸式背诵。',
    icon: 'auto_stories',
    color: '#188038',
    background: '#e6f4ea',
    href: '/poem',
  },
  {
    id: 'properties',
    title: '性质对比',
    description: '用横向对象、纵向性质的表格，逐项翻页记忆差异。',
    icon: 'table_view',
    color: '#b06000',
    background: '#fef3c7',
    href: '/properties',
  },
];

export default function MemoryPage() {
  return (
    <div className="page-enter mx-auto max-w-[1280px]">
      <section className="mb-10 border-b border-[var(--card-border)] pb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Learn · Recall · Compare</p>
        <h1 className="mt-3 text-3xl font-medium tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">记忆 Memory</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">把需要记住的内容放在一起：定义用卡片，语文用遮挡，容易混淆的性质用对比表格。</p>
      </section>

      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Choose a memory mode</p>
          <h2 className="mt-1 text-xl font-medium tracking-[-0.025em] text-[var(--foreground)]">选择背诵方式</h2>
        </div>
        <span className="shrink-0 text-sm text-[var(--muted-foreground)]">3 个工具</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => (
          <Link key={tool.id} href={tool.href} className="group relative min-h-56 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--surface-shadow)]">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105" style={{ background: tool.background }}>
              <span className="material-icons-round text-3xl" style={{ color: tool.color }}>{tool.icon}</span>
            </div>
            <h2 className="mb-2 text-lg font-medium text-[var(--foreground)]">{tool.title}</h2>
            <p className="text-sm leading-6 text-[var(--muted-foreground)]">{tool.description}</p>
            <div className="absolute right-5 top-5 grid h-8 w-8 place-items-center rounded-lg bg-[#f1f3f4] text-[var(--foreground)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:bg-[#3c4043]">
              <span className="material-icons-round text-base">arrow_forward</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">One place for recall</p>
        <h3 className="mt-2 text-base font-medium text-[var(--foreground)]">先尝试回忆，再揭示答案</h3>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">三个工具都保留原有独立页面；侧边栏只显示一个「记忆 Memory」入口，减少分散。</p>
      </div>
    </div>
  );
}
