'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { SidebarPreferences } from '@/actions/settings';
import { saveSidebarPreferences } from '@/actions/settings';
import { useLanguage } from '@/components/language-provider';
import { t } from '@/lib/i18n';
import { NAVIGATION_GROUPS, NAVIGATION_ITEMS, navigationIdFromPath, type NavigationGroupId, type NavigationItem } from '@/lib/navigation';
import { useAuthMode } from '@/components/auth/auth-mode-provider';

interface Props { initialPrefs: SidebarPreferences; adaptiveScores?: Record<string, number>; initialIsAdmin?: boolean; }
const PENDING_USAGE_KEY = 'jackyun_nav_usage_pending';
const ADAPTIVE_SNAPSHOT_KEY = 'jackyun_nav_adaptive_snapshot_v1';
const LOCAL_PREFS_KEY = 'jackyun_sidebar_preferences';

export default function Sidebar({ initialPrefs, adaptiveScores = {}, initialIsAdmin = false }: Props) {
  const { signedIn } = useAuthMode();
  const pathname = usePathname();
  const { lang } = useLanguage();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  const isAdmin = initialIsAdmin;
  const [prefs, setPrefs] = useState(initialPrefs);
  const [stableAdaptiveScores, setStableAdaptiveScores] = useState(adaptiveScores);

  useEffect(() => {
    try {
      const local = localStorage.getItem(LOCAL_PREFS_KEY);
      if (local) queueMicrotask(() => setPrefs(JSON.parse(local) as SidebarPreferences));
    } catch { /* Keep server defaults when local data is unavailable. */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobileViewport(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const toggle = () => setMobileOpen((open) => !open);
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('toggle-mobile-sidebar', toggle);
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('toggle-mobile-sidebar', toggle); window.removeEventListener('keydown', keydown); };
  }, []);
  useEffect(() => {
    const handler = (event: Event) => { if ((event as CustomEvent).detail?.collapsed) setCollapsed(true); };
    window.addEventListener('toggle-sidebar-collapse', handler);
    return () => window.removeEventListener('toggle-sidebar-collapse', handler);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [mobileOpen]);
  useEffect(() => {
    const itemId = navigationIdFromPath(pathname);
    if (!itemId) return;
    let pending: string[] = [];
    try { pending = JSON.parse(localStorage.getItem(PENDING_USAGE_KEY) || '[]'); } catch { pending = []; }
    const queue = [...pending, itemId].slice(-100);
    localStorage.setItem(PENDING_USAGE_KEY, JSON.stringify(queue));
    if (!signedIn) return;
    void (async () => {
      const remaining = [...queue];
      while (remaining.length) {
        try {
          const response = await fetch('/api/navigation-usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: remaining[0] }) });
          if (!response.ok) break;
          remaining.shift(); localStorage.setItem(PENDING_USAGE_KEY, JSON.stringify(remaining));
        } catch { break; }
      }
    })();
  }, [pathname, signedIn]);
  useEffect(() => {
    if (!prefs.adaptiveEnabled) return;
    const today = new Date().toLocaleDateString('en-CA');
    try {
      const cached = JSON.parse(localStorage.getItem(ADAPTIVE_SNAPSHOT_KEY) || 'null') as { day?: string; scores?: Record<string, number> } | null;
      if (cached?.day === today && cached.scores) queueMicrotask(() => setStableAdaptiveScores(cached.scores!));
      else localStorage.setItem(ADAPTIVE_SNAPSHOT_KEY, JSON.stringify({ day: today, scores: adaptiveScores }));
    } catch { /* A blocked localStorage must never affect navigation. */ }
  }, [adaptiveScores, prefs.adaptiveEnabled]);

  const items = useMemo(() => NAVIGATION_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.variantGroup === 'music' && item.variant !== prefs.musicMode) return false;
    if (item.variantGroup === 'answerSheet' && item.variant !== prefs.answerSheetMode) return false;
    return item.protected || !prefs.hiddenItems.includes(item.id);
  }), [isAdmin, prefs]);
  const orderedGroups = useMemo(() => {
    const rank = new Map(prefs.groupOrder.map((id, index) => [id, index]));
    return [...NAVIGATION_GROUPS].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
  }, [prefs.groupOrder]);

  function orderedItems(group: NavigationGroupId): NavigationItem[] {
    const rank = new Map((prefs.itemOrder[group] ?? []).map((id, index) => [id, index]));
    return items.filter((item) => item.group === group).sort((a, b) => {
      const pinOrder = Number(prefs.pinnedItems.includes(b.id)) - Number(prefs.pinnedItems.includes(a.id));
      if (pinOrder) return pinOrder;
      if (prefs.adaptiveEnabled) {
        const score = (stableAdaptiveScores[b.id] ?? 0) - (stableAdaptiveScores[a.id] ?? 0);
        if (score) return score;
      }
      return (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999);
    });
  }
  const flatItems = orderedGroups.flatMap((group) => orderedItems(group.id));
  function toggleGroup(group: NavigationGroupId) {
    const collapsedGroups = prefs.collapsedGroups.includes(group) ? prefs.collapsedGroups.filter((id) => id !== group) : [...prefs.collapsedGroups, group];
    const next = { ...prefs, collapsedGroups };
    setPrefs(next); if (signedIn) void saveSidebarPreferences(next);
  }
  function renderItem(item: NavigationItem) {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    return <Link key={item.id} href={item.href} onClick={() => setMobileOpen(false)} className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? 'bg-[#e8f0fe] text-[#174ea6] dark:bg-[#174ea6] dark:text-[#d2e3fc]' : 'text-[var(--foreground)] hover:bg-[#e8eaed] dark:hover:bg-[#3c4043]'}`}>
      <span className={`material-icons-round shrink-0 text-xl ${active ? 'text-[#1a73e8] dark:text-[#8ab4f8]' : 'text-[var(--muted-foreground)]'}`}>{item.icon}</span>
      {(!collapsed || mobileViewport) && <span className="min-w-0 flex-1 truncate">{t(item.labelKey, lang)}</span>}
      {(!collapsed || mobileViewport) && prefs.pinnedItems.includes(item.id) && <span className="material-icons-round text-sm text-[#1a73e8]">push_pin</span>}
    </Link>;
  }

  return <>
    <button type="button" aria-label="关闭导航菜单" className={`fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] transition-opacity md:hidden ${mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} onClick={() => setMobileOpen(false)} />
    <aside id="portal-navigation" inert={mobileViewport && !mobileOpen ? true : undefined} className={`fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-3rem))] flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] shadow-2xl transition-[transform,width] duration-200 md:static md:z-auto md:translate-x-0 md:shadow-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'md:w-16' : 'md:w-64'}`}>
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--sidebar-border)] px-4">{(!collapsed || mobileViewport) && <div className="flex items-center gap-3"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--brand)] text-sm font-bold text-white dark:text-[#202124]">J</div><div><p className="text-sm font-semibold text-[var(--foreground)]">JackYun</p><p className="text-[10px] uppercase tracking-[.12em] text-[var(--muted-foreground)]">Workspace</p></div></div>}<button type="button" onClick={() => setCollapsed(!collapsed)} className="ml-auto hidden h-11 w-11 place-items-center rounded-lg hover:bg-[#e8eaed] dark:hover:bg-[#3c4043] md:grid" aria-label="折叠侧边栏"><span className="material-icons-round text-xl text-[var(--muted-foreground)]">{collapsed ? 'menu_open' : 'menu'}</span></button></div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {prefs.layoutMode === 'flat' ? flatItems.map(renderItem) : orderedGroups.map((group) => {
          const groupItems = orderedItems(group.id);
          if (!groupItems.length) return null;
          const groupCollapsed = prefs.collapsedGroups.includes(group.id);
          return <section key={group.id} className="mb-2">{(!collapsed || mobileViewport) && <button type="button" onClick={() => toggleGroup(group.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--muted-foreground)]"><span>{group.label}</span><span className="material-icons-round ml-auto text-base">{groupCollapsed ? 'expand_more' : 'expand_less'}</span></button>}{!groupCollapsed && <div className="space-y-1">{groupItems.map(renderItem)}</div>}</section>;
        })}
      </nav>
    </aside>
  </>;
}
