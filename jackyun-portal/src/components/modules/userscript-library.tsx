'use client';

import { useMemo, useState } from 'react';
import { USERSCRIPTS, type ScriptCategory, type ScriptSafety } from '@/lib/userscripts';

const categories: { id: 'all' | ScriptCategory; label: string }[] = [
  { id: 'all', label: '全部脚本' },
  { id: 'study', label: '学习增强' },
  { id: 'video', label: '视频娱乐' },
  { id: 'reading', label: '阅读资讯' },
  { id: 'developer', label: '开发工具' },
  { id: 'productivity', label: '效率与 AI' },
  { id: 'social', label: '社交社区' },
  { id: 'privacy', label: '隐私保护' },
  { id: 'focus', label: '专注管理' },
  { id: 'communication', label: '通信工具' },
  { id: 'portal', label: 'JackYun Portal' },
];

const safetyLabels: Record<ScriptSafety, { label: string; className: string }> = {
  local: { label: '本站源码 · 本地数据', className: 'bg-[#e6f4ea] text-[#137333] dark:bg-[#137333]/25 dark:text-[#ceead6]' },
  selected: { label: '精选第三方来源', className: 'bg-[#e8f0fe] text-[#1967d2] dark:bg-[#174ea6]/35 dark:text-[#d2e3fc]' },
  caution: { label: '安装前重点检查', className: 'bg-[#fef7e0] text-[#8a5600] dark:bg-[#b06000]/25 dark:text-[#fde293]' },
};

export default function UserscriptLibrary() {
  const [category, setCategory] = useState<'all' | ScriptCategory>('all');
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return USERSCRIPTS.filter((script) => {
      const categoryMatch = category === 'all' || script.category === category;
      const textMatch = !needle || [script.name, script.description, ...script.sites, ...script.features].join(' ').toLowerCase().includes(needle);
      return categoryMatch && textMatch;
    });
  }, [category, query]);

  async function copyScript(id: string, file: string) {
    try {
      const response = await fetch(file);
      if (!response.ok) throw new Error('Script could not be loaded');
      await navigator.clipboard.writeText(await response.text());
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1800);
    } catch {
      window.alert('复制失败，请改用下载按钮。');
    }
  }

  return (
    <div className="page-enter mx-auto max-w-6xl">
      <section className="overflow-hidden rounded-3xl bg-[#202124] px-5 py-7 text-white shadow-xl sm:px-8 sm:py-9">
        <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#aecbfa]">
              <span className="material-icons-round text-base">extension</span>
              Tampermonkey Userscripts
            </div>
            <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-4xl">网站插件大全</h1>
            <p className="mt-3 text-sm leading-6 text-[#bdc1c6] sm:text-base">收录学习、AI、视频、阅读、开发、社交、效率和隐私脚本，并提供本站自研助手。每个条目都标明来源、适用网站与权限范围。</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-[#bdc1c6] lg:max-w-xs">
            <p className="font-semibold text-white">使用前确认</p>
            <p className="mt-1 leading-5">请先安装 Tampermonkey。第三方脚本不能保证绝对安全；安装前请检查更新日期、权限、源码与用户反馈。</p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-3">
          <span className="material-icons-round text-xl text-[var(--muted-foreground)]">search</span>
          <span className="sr-only">搜索脚本</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索脚本或适用网站…" className="min-w-0 flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none" />
        </label>
        <div className="flex gap-2 overflow-x-auto" aria-label="脚本分类">
          {categories.map((item) => (
            <button key={item.id} type="button" onClick={() => setCategory(item.id)} aria-pressed={category === item.id} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${category === item.id ? 'border-[var(--brand)] bg-[var(--brand)] text-white dark:text-[#202124]' : 'border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--brand)]'}`}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 mt-5 text-sm text-[var(--muted-foreground)]">{visible.length} 个可用脚本</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map((script) => {
          const safety = script.safety ?? (script.file ? 'local' : 'selected');
          const safetyMeta = safetyLabels[safety];
          return (
          <article key={script.id} className="flex flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-[var(--surface-shadow)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">{script.name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-[var(--muted-foreground)]">
                  <span>{script.version === 'GitHub' || script.version === '官方发布版' ? script.version : `v${script.version}`}</span>
                  {script.external && <span className="rounded-full bg-[#f3e8fd] px-2 py-0.5 font-sans font-semibold text-[#8430ce] dark:bg-[#8430ce]/25 dark:text-[#e9d2fd]">第三方</span>}
                  {script.license && <span className="font-sans">{script.license}</span>}
                </div>
              </div>
              <span className="material-icons-round grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f0fe] text-[#1a73e8] dark:bg-[#174ea6]/45 dark:text-[#aecbfa]">code</span>
            </div>
            <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">{script.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`rounded-full px-2.5 py-1 font-semibold ${safetyMeta.className}`}>{safetyMeta.label}</span>
              {script.sourceLabel && <span className="rounded-full border border-[var(--card-border)] px-2.5 py-1 text-[var(--muted-foreground)]">来源：{script.sourceLabel}</span>}
              {script.updated && <span className="text-[var(--muted-foreground)]">更新 {script.updated}</span>}
            </div>
            {script.popularity && <p className="mt-2 text-xs text-[var(--muted-foreground)]">{script.popularity}</p>}
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">适用网站</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{script.sites.map((site) => <span key={site} className="rounded-full border border-[var(--card-border)] px-2.5 py-1 font-mono text-[11px] text-[var(--foreground)]">{site}</span>)}</div>
            </div>
            <ul className="mt-4 grid gap-2 text-sm text-[var(--foreground)] sm:grid-cols-2">
              {script.features.map((feature) => <li key={feature} className="flex items-center gap-2"><span className="material-icons-round text-base text-[#34a853]">check_circle</span>{feature}</li>)}
            </ul>
            {script.permissions && <div className="mt-4 rounded-xl border border-[var(--card-border)] px-3 py-2 text-xs leading-5 text-[var(--muted-foreground)]"><span className="font-semibold text-[var(--foreground)]">权限范围：</span>{script.permissions.join(' · ')}</div>}
            {script.caution && <p className="mt-4 rounded-xl bg-[#fef7e0] px-3 py-2 text-xs leading-5 text-[#7a4f01] dark:bg-[#b06000]/20 dark:text-[#fde293]">{script.caution}</p>}
            <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
              {script.file ? (
                <button type="button" onClick={() => copyScript(script.id, script.file!)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--card-border)] px-3 text-sm font-semibold text-[var(--foreground)] hover:border-[var(--brand)]">
                  <span className="material-icons-round text-lg">{copiedId === script.id ? 'done' : 'content_copy'}</span>
                  {copiedId === script.id ? '已复制' : '复制源码'}
                </button>
              ) : (
                <a href={script.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--card-border)] px-3 text-sm font-semibold text-[var(--foreground)] hover:border-[var(--brand)]">
                  <span className="material-icons-round text-lg">code</span>
                  查看 {script.sourceLabel ?? '来源'}
                </a>
              )}
              <a href={script.file ?? script.installUrl} download={script.file ? true : undefined} target={script.external ? '_blank' : undefined} rel={script.external ? 'noopener noreferrer' : undefined} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-3 text-sm font-semibold text-white hover:bg-[var(--brand-strong)] dark:text-[#202124]">
                <span className="material-icons-round text-lg">{script.external ? 'extension' : 'download'}</span>
                {script.external ? '查看 / 安装' : '下载脚本'}
              </a>
            </div>
          </article>
          );
        })}
      </div>
      {visible.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--card-border)] py-16 text-center text-sm text-[var(--muted-foreground)]">没有找到匹配的脚本。</div>}
    </div>
  );
}
