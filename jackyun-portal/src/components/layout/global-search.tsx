'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NAVIGATION_GROUPS, NAVIGATION_ITEMS } from '@/lib/navigation';
import { t } from '@/lib/i18n';
import { useLanguage } from '@/components/language-provider';
import { readOfflineSnapshot } from '@/lib/offline/workspace';

export const OPEN_GLOBAL_SEARCH_EVENT = 'jackyun-open-global-search';

const EXTRA_PAGES = [
  { id: 'pomodoro', title: '番茄钟', href: '/pomodoro', icon: 'timer', terms: '番茄 专注 计时 focus pomodoro' },
  { id: 'countdown', title: '倒计时', href: '/countdown', icon: 'event', terms: '倒计时 考试 日期 countdown' },
  { id: 'study-tasks', title: '学习任务', href: '/study/tasks', icon: 'checklist', terms: '任务 计划 待办 study task' },
  { id: 'timetable-hub', title: '课表中心', href: '/timetable-hub', icon: 'calendar_month', terms: '课表 时间表 timetable' },
  { id: 'exam-countdown', title: '考试倒计时', href: '/examcountdown', icon: 'event', terms: '考试 倒计时 exam' },
  { id: 'ielts-resources', title: '雅思学习资源', href: '/resources', icon: 'travel_explore', terms: '雅思 资源 阅读 IELTS resource' },
];

const SEARCH_ALIASES: Record<string, string> = {
  'practice-timer': '练习计时 刷题计时 IELTS 听力 阅读 写作 口语',
  'study-plan': '学习计划 任务 目标 todo', review: '错题 间隔复习 复习 flashcard',
  vocab: '单词 词汇 背单词 vocabulary', schedule: '课表 日程 课程 CUE',
  mock: '模拟考试 真题 mock test', quizwise: '测验 quiz',
  reading: '阅读 阅读理解', memory: '记忆 生词 诗词',
};

interface SearchResult {
  id: string;
  title: string;
  detail: string;
  href: string;
  icon: string;
  type: 'page' | 'task' | 'review';
  terms: string;
}

function cachedResults(value: unknown): SearchResult[] {
  if (!value || typeof value !== 'object') return [];
  const data = value as { plans?: unknown[]; inboxTasks?: unknown[]; dueItems?: unknown[]; items?: unknown[] };
  const tasks = [...(Array.isArray(data.plans) ? data.plans.flatMap(plan => {
    if (!plan || typeof plan !== 'object') return [];
    const row = plan as { title?: string; tasks?: unknown[] };
    return (Array.isArray(row.tasks) ? row.tasks : []).map(task => ({ task, planTitle: row.title ?? '学习计划' }));
  }) : []), ...(Array.isArray(data.inboxTasks) ? data.inboxTasks.map(task => ({ task, planTitle: '收集箱' })) : [])];
  const taskResults = tasks.flatMap(({ task, planTitle }) => {
    if (!task || typeof task !== 'object') return [];
    const row = task as { id?: string; title?: string; completed?: boolean; due_date?: string | null };
    if (!row.title || row.completed) return [];
    return [{ id: `task:${row.id ?? row.title}`, title: row.title, detail: `${planTitle}${row.due_date ? ` · 截止 ${row.due_date}` : ''}`, href: '/study/tasks', icon: 'task_alt', type: 'task' as const, terms: `${row.title} ${planTitle}` }];
  });
  const reviews = [...(Array.isArray(data.dueItems) ? data.dueItems : []), ...(Array.isArray(data.items) ? data.items : [])].flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const row = item as { id?: string; question_text?: string; subject?: string; question?: string };
    const title = row.question_text ?? row.question;
    if (!title) return [];
    return [{ id: `review:${row.id ?? title}`, title, detail: `错题复习${row.subject ? ` · ${row.subject}` : ''}`, href: '/review', icon: 'history_edu', type: 'review' as const, terms: `${title} ${row.subject ?? ''}` }];
  });
  return [...taskResults, ...reviews];
}

export default function GlobalSearch({ userId, isAdmin = false, betaActive = false, allowedFeatureKeys = ['reading'] }: {
  userId: string | null;
  isAdmin?: boolean;
  betaActive?: boolean;
  allowedFeatureKeys?: string[];
}) {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cached, setCached] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const openSearch = () => { setQuery(''); setOpen(true); };
    window.addEventListener(OPEN_GLOBAL_SEARCH_EVENT, openSearch);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Enter' && open) {
        const first = document.querySelector<HTMLAnchorElement>('[data-global-search-result]');
        first?.click();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener(OPEN_GLOBAL_SEARCH_EVENT, openSearch); window.removeEventListener('keydown', keydown); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    void Promise.all([readOfflineSnapshot(userId, 'tasks'), readOfflineSnapshot(userId, 'review')])
      .then(([tasks, review]) => { if (!cancelled) setCached([...cachedResults(tasks), ...cachedResults(review)]); })
      .catch(() => { if (!cancelled) setCached([]); });
    return () => { cancelled = true; };
  }, [open, userId]);

  const results = useMemo(() => {
    const searchable = NAVIGATION_ITEMS.filter(item =>
      (!item.adminOnly || isAdmin) && (!item.betaOnly || betaActive) && (!item.protected || Boolean(userId)) && (!item.featureKey || allowedFeatureKeys.includes(item.featureKey)),
    ).map(item => {
      const label = t(item.labelKey, lang);
      const group = NAVIGATION_GROUPS.find(candidate => candidate.id === item.group)?.label ?? '';
      const aliases = `${item.id} ${item.href} ${group} ${label} ${SEARCH_ALIASES[item.id] ?? ''}`;
      return { id: item.id, title: label, detail: group, href: item.href, icon: item.icon, type: 'page' as const, terms: aliases };
    });
    const extras = EXTRA_PAGES.filter(page => !searchable.some(item => item.href === page.href)).map(page => ({ ...page, detail: '页面', type: 'page' as const }));
    const all = [...searchable, ...extras, ...cached];
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return all.slice(0, 12);
    return all.map(result => ({ result, index: result.terms.toLocaleLowerCase().indexOf(needle) }))
      .filter(entry => entry.index >= 0 || entry.result.title.toLocaleLowerCase().includes(needle))
      .sort((a, b) => (a.index < 0 ? 999 : a.index) - (b.index < 0 ? 999 : b.index) || a.result.title.localeCompare(b.result.title, lang === 'zh' ? 'zh-CN' : 'en'))
      .slice(0, 16).map(entry => entry.result);
  }, [query, cached, lang, userId, isAdmin, betaActive, allowedFeatureKeys]);

  if (!open) return null;
  return <div className="fixed inset-0 z-[130] flex items-start justify-center bg-black/45 p-3 pt-[min(14vh,7rem)] backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="global-search-title" data-ui-dialog data-state="open" className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl">
      <h2 id="global-search-title" className="sr-only">全站搜索</h2>
      <div className="flex items-center gap-3 border-b border-[var(--card-border)] px-4">
        <span aria-hidden="true" className="material-icons-round text-[var(--muted-foreground)]">search</span>
        <input ref={inputRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={lang === 'zh' ? '搜索页面、学习任务或错题…' : 'Search pages, tasks, or review items…'} className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted-foreground)]" />
        <kbd className="rounded border border-[var(--card-border)] px-1.5 py-1 text-[10px] text-[var(--muted-foreground)]">Esc</kbd>
      </div>
      <div className="max-h-[min(60vh,30rem)] overflow-y-auto p-2" role="listbox" aria-label="搜索结果">
        {results.length ? results.map(result => <Link key={result.id} href={result.href} data-global-search-result role="option" aria-selected="false" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[var(--background)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1a73e8]">
          <span aria-hidden="true" className="material-icons-round text-lg text-[var(--muted-foreground)]">{result.icon}</span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{result.title}</strong><span className="mt-0.5 block truncate text-xs text-[var(--muted-foreground)]">{result.detail}</span></span>
          {result.type !== 'page' && <span className="text-[10px] text-[var(--muted-foreground)]">本机缓存</span>}
          <span aria-hidden="true" className="material-icons-round text-base text-[var(--muted-foreground)]">arrow_forward</span>
        </Link>) : <p className="px-4 py-10 text-center text-sm text-[var(--muted-foreground)]">没有匹配结果</p>}
      </div>
      <p className="border-t border-[var(--card-border)] px-4 py-2.5 text-[11px] text-[var(--muted-foreground)]">Ctrl K 打开 · 可离线搜索本机已缓存的任务和错题</p>
    </section>
  </div>;
}
