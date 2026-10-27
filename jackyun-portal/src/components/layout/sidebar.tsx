'use client';
import { workspaceStorage } from '@/lib/sync/repository';


import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SidebarPreferences } from '@/actions/settings';
import { saveSidebarPreferences } from '@/actions/settings';
import { useLanguage } from '@/components/language-provider';
import { t } from '@/lib/i18n';
import { NAVIGATION_GROUPS, NAVIGATION_ITEMS, navigationIdFromPath, type NavigationGroupId, type NavigationItem } from '@/lib/navigation';
import { useAuthMode } from '@/components/auth/auth-mode-provider';
import { PAGE_PREFERENCE_KEY } from '@/lib/page-preferences';
import BrandLogo from '@/components/brand-logo';
import { TOUCH_WORKSPACE_QUERY } from '@/lib/workspace-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { coerceNavigationPreferences } from '@/lib/companion';
import { canPrefetchNavigation } from '@/lib/navigation-prefetch';

interface Props { initialPrefs: SidebarPreferences; adaptiveScores?: Record<string, number>; initialIsAdmin?: boolean; betaActive?: boolean; allowedFeatureKeys?: string[]; }
const PENDING_USAGE_KEY = 'jackyun_nav_usage_queue_v2';
const ADAPTIVE_SNAPSHOT_KEY = 'jackyun_nav_adaptive_snapshot_v1';
const LOCAL_PREFS_KEY = 'jackyun_sidebar_preferences';

export default function Sidebar({ initialPrefs, adaptiveScores = {}, initialIsAdmin = false, betaActive = false, allowedFeatureKeys = [] }: Props) {
  const { signedIn } = useAuthMode();
  const pathname = usePathname();
  const router = useRouter();
  const [navigation, setNavigation] = useState<{ href: string; from: string } | null>(null);
  const [slow, setSlow] = useState(false);
  const pendingHref = navigation?.from === pathname && navigation.href !== pathname ? navigation.href : null;
  useEffect(() => {
    if (!pendingHref) return;
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [pendingHref]);
  const prepare = (item: NavigationItem) => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    let enabled = true;
    try { enabled = JSON.parse(workspaceStorage.getItem(PAGE_PREFERENCE_KEY) || '{}').intentPrefetch !== false; } catch {}
    if (canPrefetchNavigation(item, { signedIn, online: navigator.onLine, saveData: connection?.saveData, effectiveType: connection?.effectiveType, enabled })) router.prefetch(item.href);
  };
  useEffect(() => {
    if (!navigation || navigation.from === pathname) return;
    queueMicrotask(() => setNavigation(current => current?.from === pathname ? current : null));
  }, [navigation, pathname]);
  const navigate = (href: string) => { setSlow(false); setNavigation({ href, from: pathname }); setMobileOpen(false); };
  const { lang } = useLanguage();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  const [query, setQuery] = useState('');
  const drawerRef = useRef<HTMLElement>(null);
  const isAdmin = initialIsAdmin;
  const [prefs, setPrefs] = useState(initialPrefs);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [stableAdaptiveScores, setStableAdaptiveScores] = useState(adaptiveScores);

  useEffect(() => {
    let stored = initialPrefs;
    try {
      const local = workspaceStorage.getItem(LOCAL_PREFS_KEY);
      if (local) stored = coerceNavigationPreferences(JSON.parse(local));
    } catch { /* Keep server defaults if the local value cannot be read. */ }
    queueMicrotask(() => { setPrefs(stored); setPreferencesReady(true); });
  }, [initialPrefs]);
  useEffect(() => {
    if (!preferencesReady) return;
    try { workspaceStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs, preferencesReady]);
  useEffect(() => {
    const media = window.matchMedia(TOUCH_WORKSPACE_QUERY);
    const update = () => { setMobileViewport(media.matches); if (!media.matches) setMobileOpen(false); };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const toggle = () => { setQuery(''); setMobileOpen((open) => !open); };
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) setMobileOpen(false); };
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
    window.dispatchEvent(new CustomEvent('mobile-sidebar-state', { detail: { open: mobileOpen && mobileViewport } }));
    if (!mobileOpen || !mobileViewport) return;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    const content = document.querySelector<HTMLElement>('[data-portal-content]');
    const previousInert = content?.inert ?? false;
    if (content) content.inert = true;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector<HTMLButtonElement>('[data-drawer-close]')?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button, input') ?? []).filter((element) => element.getClientRects().length > 0 && !element.hasAttribute('disabled'));
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', trapFocus);
    return () => {
      document.body.style.overflow = previous;
      if (content) content.inert = previousInert;
      window.removeEventListener('keydown', trapFocus);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mobileOpen, mobileViewport]);
  useEffect(() => {
    const itemId = navigationIdFromPath(pathname);
    if (!itemId) return;
    let pending: string[] = [];
    try {
      const stored: unknown = JSON.parse(workspaceStorage.getItem(PENDING_USAGE_KEY) || '[]');
      if (Array.isArray(stored)) pending = stored.filter((item): item is string => typeof item === 'string');
    } catch { /* Navigation also works when browser storage is unavailable. */ }
    const queue = [...pending, itemId].slice(-100);
    try { workspaceStorage.setItem(PENDING_USAGE_KEY, JSON.stringify(queue)); } catch { /* Usage analytics must not interrupt navigation. */ }
    if (!signedIn) return;
    void (async () => {
      const remaining = [...queue];
      while (remaining.length) {
        try {
          const response = await fetch('/api/navigation-usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: remaining[0] }) });
          if (!response.ok) break;
          remaining.shift(); workspaceStorage.setItem(PENDING_USAGE_KEY, JSON.stringify(remaining));
        } catch { break; }
      }
    })();
  }, [pathname, signedIn]);
  useEffect(() => {
    if (!prefs.adaptiveEnabled) return;
    const today = new Date().toLocaleDateString('en-CA');
    try {
      const cached = JSON.parse(workspaceStorage.getItem(ADAPTIVE_SNAPSHOT_KEY) || 'null') as { day?: string; scores?: Record<string, number> } | null;
      if (cached?.day === today && cached.scores) queueMicrotask(() => setStableAdaptiveScores(cached.scores!));
      else workspaceStorage.setItem(ADAPTIVE_SNAPSHOT_KEY, JSON.stringify({ day: today, scores: adaptiveScores }));
    } catch { /* A blocked localStorage must never affect navigation. */ }
  }, [adaptiveScores, prefs.adaptiveEnabled]);

  const items = useMemo(() => NAVIGATION_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.betaOnly && !betaActive) return false;
    if (item.featureKey && !allowedFeatureKeys.includes(item.featureKey)) return false;
    if (item.variantGroup === 'music' && item.variant !== prefs.musicMode) return false;
    if (item.variantGroup === 'answerSheet' && item.variant !== prefs.answerSheetMode) return false;
    return item.protected || !prefs.hiddenItems.includes(item.id);
  }), [allowedFeatureKeys, betaActive, isAdmin, prefs]);
  const orderedGroups = useMemo(() => {
    const rank = new Map(prefs.groupOrder.map((id, index) => [id, index]));
    return [...NAVIGATION_GROUPS].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
  }, [prefs.groupOrder]);

  function orderedItems(group: NavigationGroupId): NavigationItem[] {
    const rank = new Map((prefs.itemOrder[group] ?? []).map((id, index) => [id, index]));
    const needle = query.trim().toLowerCase();
    return items.filter((item) => item.group === group && (!mobileViewport || !needle || `${t(item.labelKey, lang)} ${item.href} ${item.id}`.toLowerCase().includes(needle))).sort((a, b) => {
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
    return <Link key={item.id} href={item.href} aria-current={active ? 'page' : undefined} prefetch={false} onMouseEnter={() => prepare(item)} onFocus={() => prepare(item)} onNavigate={() => navigate(item.href)} aria-busy={pendingHref === item.href || undefined} title={collapsed && !mobileViewport ? t(item.labelKey, lang) : undefined} className="jy-nav-link group">
      <span aria-hidden="true" className={`material-icons-round shrink-0 text-xl ${active ? 'text-[var(--brand)]' : 'text-[var(--muted-foreground)]'}`}>{item.icon}</span>
      {(!collapsed || mobileViewport) && <span className="min-w-0 flex-1 truncate">{t(item.labelKey, lang)}</span>}
      {(!collapsed || mobileViewport) && prefs.pinnedItems.includes(item.id) && <span className="material-icons-round text-sm text-[#1a73e8]">push_pin</span>}
    </Link>;
  }

  return <>
    {pendingHref && <div role="status" className="jy-navigation-pending"><span aria-hidden="true" className="jy-navigation-pending-spinner" /><span className="jy-navigation-pending-message">{slow ? '连接较慢，正在打开页面…' : '正在打开页面…'}</span>{slow && <a className="jy-navigation-pending-retry" href={pendingHref}>重新打开</a>}<button type="button" aria-label="关闭导航提示" onClick={() => setNavigation(null)} className="jy-navigation-pending-close">×</button></div>}
    <button type="button" tabIndex={-1} aria-hidden="true" className={`portal-touch-backdrop fixed inset-0 z-[80] bg-black/45 backdrop-blur-[1px] transition-opacity lg:hidden ${mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} onClick={() => setMobileOpen(false)} />
    <aside ref={drawerRef} id="portal-navigation" data-navigation-drawer data-open={mobileOpen} aria-label={lang === 'en' ? 'All modules' : '全部功能'} role={mobileViewport && mobileOpen ? 'dialog' : undefined} aria-modal={mobileViewport && mobileOpen ? true : undefined} inert={mobileViewport && !mobileOpen ? true : undefined} className={`portal-drawer fixed inset-y-0 left-0 z-[90] flex w-[min(20rem,calc(100vw-3rem))] flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] shadow-2xl transition-[transform,width] duration-200 lg:static lg:z-auto lg:translate-x-0 lg:shadow-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-16' : 'lg:w-64'}`}>
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--sidebar-border)] px-4">{(!collapsed || mobileViewport) && <div className="flex items-center gap-3"><BrandLogo size={32} className="h-8 w-8 shrink-0" priority /><div><p className="text-sm font-semibold text-[var(--foreground)]">JackYun</p><p className="text-[10px] uppercase tracking-[.12em] text-[var(--muted-foreground)]">Workspace</p></div></div>}<Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed} className="portal-desktop-control ml-auto hidden h-11 w-11 place-items-center rounded-lg lg:grid" aria-label="折叠侧边栏"><span aria-hidden="true" className="material-icons-round text-xl text-[var(--muted-foreground)]">{collapsed ? 'menu_open' : 'menu'}</span></Button></div>
      <Button data-drawer-close variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label={lang === 'en' ? 'Close navigation' : '关闭导航菜单'} className="portal-touch-close absolute right-3 top-[max(0.5rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-xl bg-[var(--sidebar-bg)] lg:hidden"><span aria-hidden="true" className="material-icons-round">close</span></Button>
      <label className="portal-touch-search mx-3 mt-3 flex shrink-0 items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 lg:hidden"><span aria-hidden="true" className="material-icons-round text-[var(--muted-foreground)]">search</span><Input type="search" aria-label={lang === 'en' ? 'Search modules' : '搜索功能'} placeholder={lang === 'en' ? 'Search modules…' : '搜索功能…'} value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent" /></label>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {mobileViewport && flatItems.length === 0 && <p className="p-4 text-sm text-[var(--muted-foreground)]" role="status">{lang === 'en' ? 'No matching modules' : '没有找到匹配的功能'}</p>}
        {prefs.layoutMode === 'flat' ? flatItems.map(renderItem) : orderedGroups.map((group) => {
          const groupItems = orderedItems(group.id);
          if (!groupItems.length) return null;
          const groupCollapsed = !(mobileViewport && query.trim()) && prefs.collapsedGroups.includes(group.id);
          return <section key={group.id} className="mb-2">{(!collapsed || mobileViewport) && <Button variant="ghost" aria-expanded={!groupCollapsed} onClick={() => toggleGroup(group.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--muted-foreground)]"><span>{group.label}</span><span className="material-icons-round ml-auto text-base">{groupCollapsed ? 'expand_more' : 'expand_less'}</span></Button>}{!groupCollapsed && <div className="space-y-1">{groupItems.map(renderItem)}</div>}</section>;
        })}
      </nav>
    </aside>
    <nav aria-label={lang === 'en' ? 'Quick navigation' : '快捷导航'} className="portal-mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[var(--card-border)] bg-[var(--card)] px-1 pt-1 lg:hidden" inert={mobileOpen ? true : undefined}>
      {['dashboard', 'study-plan', 'schedule', 'settings'].map((id) => items.find((item) => item.id === id)).map((item, index) => item ? <Link key={item.id} href={item.href} prefetch={false} onMouseEnter={() => prepare(item)} onFocus={() => prepare(item)} onNavigate={() => navigate(item.href)} aria-current={navigationIdFromPath(pathname) === item.id ? 'page' : undefined} className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium ${navigationIdFromPath(pathname) === item.id ? 'bg-[var(--brand)]/10 text-[var(--brand)]' : 'text-[var(--muted-foreground)]'}`}><span aria-hidden="true" className="material-icons-round text-[22px]">{item.icon}</span><span>{lang === 'en' ? ['Home', 'Study', 'Schedule', 'Settings'][index] : ['首页', '学习', '日程', '设置'][index]}</span></Link> : <span key={index} />)}
      <button type="button" aria-controls="portal-navigation" aria-expanded={mobileOpen} onClick={() => { setQuery(''); setMobileOpen(true); }} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-[var(--muted-foreground)]"><span aria-hidden="true" className="material-icons-round text-[22px]">apps</span><span>{lang === 'en' ? 'All' : '全部'}</span></button>
    </nav>
  </>;
}
