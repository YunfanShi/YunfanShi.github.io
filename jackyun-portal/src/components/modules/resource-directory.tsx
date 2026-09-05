'use client';

import { useMemo, useState } from 'react';
import { LEARNING_RESOURCES, RESOURCE_CATEGORIES, type ResourceCategory } from '@/lib/learning-resources';

const COURSE_LABELS: Partial<Record<ResourceCategory, string>> = {
  igcse: 'IGCSE',
  alevel: 'A Level',
};

export default function ResourceDirectory() {
  const [category, setCategory] = useState<'all' | ResourceCategory>('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return LEARNING_RESOURCES.filter((resource) => {
      const categoryMatch = category === 'all' || resource.categories.includes(category);
      const textMatch = !needle || [resource.name, resource.description, ...resource.tags]
        .join(' ')
        .toLowerCase()
        .includes(needle);
      return categoryMatch && textMatch;
    });
  }, [category, query]);

  return (
    <div className="page-enter mx-auto max-w-6xl">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] px-5 py-7 shadow-[var(--surface-shadow)] sm:px-8 sm:py-9">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#4285f4]/10 blur-2xl" />
        <div className="relative max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e8f0fe] px-3 py-1.5 text-xs font-semibold text-[#174ea6] dark:bg-[#174ea6]/40 dark:text-[#d2e3fc]">
            <span className="material-icons-round text-base">bookmarks</span>
            来自 Bookmarks、官方平台与开源社区
          </div>
          <h1 className="text-3xl font-bold tracking-[-0.04em] text-[var(--foreground)] sm:text-4xl">学习网站收录</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)] sm:text-base">
            按考试体系和学习方向整理资料站、真题库、AI 助手、公开课程与研究工具。每张卡片都会说明适合什么场景，减少在书签里反复寻找。
          </p>
          <label className="mt-6 flex max-w-xl items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 focus-within:border-[var(--brand)]">
            <span className="material-icons-round text-xl text-[var(--muted-foreground)]">search</span>
            <span className="sr-only">搜索学习资源</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索网站、科目或用途…"
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="清除搜索" className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--card-border)]">
                <span className="material-icons-round text-lg">close</span>
              </button>
            )}
          </label>
        </div>
      </section>

      <div className="mt-6 flex gap-2 overflow-x-auto pb-2" aria-label="资源分类">
        {RESOURCE_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setCategory(item.id)}
            aria-pressed={category === item.id}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              category === item.id
                ? 'border-[var(--brand)] bg-[var(--brand)] text-white dark:text-[#202124]'
                : 'border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] hover:border-[var(--brand)]'
            }`}
          >
            <span className="material-icons-round text-lg">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="mb-3 mt-3 flex items-center justify-between">
        <p className="text-sm text-[var(--muted-foreground)]">找到 {visible.length} 个资源</p>
        <p className="hidden text-xs text-[var(--muted-foreground)] sm:block">外部链接将在新标签页打开</p>
      </div>

      {visible.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((resource) => (
            <article key={resource.url} className="group flex min-h-64 flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 shadow-[var(--surface-shadow)] transition hover:-translate-y-0.5 hover:border-[var(--brand)]">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e8f0fe] text-lg font-bold text-[#1a73e8] dark:bg-[#174ea6]/45 dark:text-[#aecbfa]">
                  {resource.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {resource.categories.map((resourceCategory) => COURSE_LABELS[resourceCategory] && (
                    <span key={resourceCategory} className="rounded-full bg-[#e8f0fe] px-2 py-1 text-[10px] font-semibold text-[#174ea6] dark:bg-[#174ea6]/40 dark:text-[#d2e3fc]">
                      {COURSE_LABELS[resourceCategory]}
                    </span>
                  ))}
                  {resource.featured && <span className="rounded-full bg-[#e6f4ea] px-2 py-1 text-[10px] font-semibold text-[#137333] dark:bg-[#137333]/35 dark:text-[#ceead6]">推荐</span>}
                  {resource.source === 'official' && <span className="rounded-full bg-[#fef7e0] px-2 py-1 text-[10px] font-semibold text-[#b06000] dark:bg-[#b06000]/30 dark:text-[#fde293]">官方</span>}
                </div>
              </div>
              <h2 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-[var(--foreground)]">{resource.name}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">{resource.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {resource.tags.map((tag) => <span key={tag} className="rounded-md bg-[var(--background)] px-2 py-1 text-[11px] text-[var(--muted-foreground)]">{tag}</span>)}
              </div>
              <a href={resource.url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)] dark:text-[#202124]">
                打开网站
                <span className="material-icons-round text-lg">open_in_new</span>
              </a>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--card-border)] py-16 text-center">
          <span className="material-icons-round text-4xl text-[var(--muted-foreground)]">search_off</span>
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">没有找到匹配的资源，试试其他关键词。</p>
        </div>
      )}
    </div>
  );
}
