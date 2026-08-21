'use client';

import { useEffect, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { saveSidebarPreferences, type SidebarPreferences } from '@/actions/settings';
import { NAVIGATION_GROUPS, NAVIGATION_ITEMS } from '@/lib/navigation';
import { DEFAULT_NAVIGATION_PREFERENCES } from '@/lib/companion';
import { useAuthMode } from '@/components/auth/auth-mode-provider';

function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-center gap-2 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 ${isDragging ? 'z-10 shadow-lg' : ''}`}>
    <button type="button" aria-label="拖动排序" className="touch-none cursor-grab text-[var(--muted-foreground)] active:cursor-grabbing" {...attributes} {...listeners}><span className="material-icons-round text-lg">drag_indicator</span></button>{children}
  </div>;
}

function SortableList({ ids, onChange, render }: { ids: string[]; onChange: (ids: string[]) => void; render: (id: string) => React.ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function end(event: DragEndEvent) { if (event.over && event.active.id !== event.over.id) onChange(arrayMove(ids, ids.indexOf(String(event.active.id)), ids.indexOf(String(event.over.id)))); }
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}><SortableContext items={ids} strategy={verticalListSortingStrategy}><div className="space-y-2">{ids.map(render)}</div></SortableContext></DndContext>;
}

export default function SidebarPrefsPanel({ initialPrefs }: { initialPrefs: SidebarPreferences }) {
  const { signedIn } = useAuthMode();
  const [prefs, setPrefs] = useState(initialPrefs);
  const [status, setStatus] = useState('');
  useEffect(() => { try { const local = localStorage.getItem('jackyun_sidebar_preferences'); if (local) queueMicrotask(() => setPrefs(JSON.parse(local) as SidebarPreferences)); } catch {} }, []);
  async function save(next = prefs) {
    setStatus('保存中…');
    try { localStorage.setItem('jackyun_sidebar_preferences', JSON.stringify(next)); } catch {}
    if (!signedIn) { setStatus('已保存到本机；登录后自动同步'); return; }
    const result = await saveSidebarPreferences(next);
    setStatus(result.error ? '已保存到本机；云同步暂时不可用' : '已保存到本机并同步到云端');
  }
  function toggle(list: 'hiddenItems' | 'pinnedItems', id: string) { setPrefs((current) => ({ ...current, [list]: current[list].includes(id) ? current[list].filter((item) => item !== id) : [...current[list], id] })); }

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="rounded-xl border border-[var(--card-border)] p-3 text-sm"><span className="block font-medium">导航布局</span><select value={prefs.layoutMode} onChange={(event) => setPrefs({ ...prefs, layoutMode: event.target.value === 'flat' ? 'flat' : 'grouped' })} className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2"><option value="grouped">分组</option><option value="flat">平铺</option></select></label>
      <label className="rounded-xl border border-[var(--card-border)] p-3 text-sm"><span className="block font-medium">音乐模块</span><select value={prefs.musicMode} onChange={(event) => setPrefs({ ...prefs, musicMode: event.target.value === 'sync' ? 'sync' : 'player' })} className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2"><option value="player">音乐播放器</option><option value="sync">同步音乐</option></select></label>
      <label className="rounded-xl border border-[var(--card-border)] p-3 text-sm"><span className="block font-medium">答题卡模块</span><select value={prefs.answerSheetMode} onChange={(event) => setPrefs({ ...prefs, answerSheetMode: event.target.value === 'sync' ? 'sync' : 'standard' })} className="mt-2 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-2"><option value="standard">标准答题卡</option><option value="sync">同步答题卡</option></select></label>
    </div>
    <label className="flex items-center justify-between rounded-xl border border-[var(--card-border)] p-4"><span><strong className="block text-sm">自适应排序</strong><small className="text-[var(--muted-foreground)]">默认关闭；只在分组内部按最近使用频率调整。</small></span><input type="checkbox" checked={prefs.adaptiveEnabled} onChange={(event) => setPrefs({ ...prefs, adaptiveEnabled: event.target.checked })} className="h-5 w-5" /></label>
    <div><h3 className="mb-2 text-sm font-semibold">分组顺序</h3><SortableList ids={prefs.groupOrder} onChange={(groupOrder) => setPrefs({ ...prefs, groupOrder })} render={(id) => { const group = NAVIGATION_GROUPS.find((item) => item.id === id); return <SortableRow key={id} id={id}><span className="material-icons-round text-lg text-[#1a73e8]">{group?.icon ?? 'folder'}</span><span className="text-sm font-medium">{group?.label ?? id}</span></SortableRow>; }} /></div>
    <div><h3 className="mb-2 text-sm font-semibold">项目顺序、固定与显示</h3><div className="space-y-4">{prefs.groupOrder.map((groupId) => {
      const group = NAVIGATION_GROUPS.find((item) => item.id === groupId); const ids = prefs.itemOrder[groupId] ?? [];
      return <section key={groupId} className="rounded-2xl bg-[var(--background)] p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{group?.label ?? groupId}</p><SortableList ids={ids} onChange={(nextIds) => setPrefs({ ...prefs, itemOrder: { ...prefs.itemOrder, [groupId]: nextIds } })} render={(id) => { const item = NAVIGATION_ITEMS.find((entry) => entry.id === id); if (!item) return <div key={id} />; const locked = Boolean(item.protected); return <SortableRow key={id} id={id}><span className="material-icons-round text-lg">{item.icon}</span><span className="min-w-0 flex-1 truncate text-sm">{item.labelKey.replace('nav.', '')}</span><button type="button" disabled={locked} onClick={() => toggle('pinnedItems', id)} title="固定" className="grid h-8 w-8 place-items-center rounded-lg disabled:opacity-30"><span className={`material-icons-round text-lg ${prefs.pinnedItems.includes(id) ? 'text-[#1a73e8]' : 'text-[var(--muted-foreground)]'}`}>push_pin</span></button><button type="button" disabled={locked} onClick={() => toggle('hiddenItems', id)} title="显示或隐藏" className="grid h-8 w-8 place-items-center rounded-lg disabled:opacity-30"><span className="material-icons-round text-lg text-[var(--muted-foreground)]">{prefs.hiddenItems.includes(id) ? 'visibility_off' : 'visibility'}</span></button></SortableRow>; }} /></section>;
    })}</div></div>
    <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => save()} className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white dark:text-[#202124]">保存并同步</button><button type="button" onClick={() => setPrefs(DEFAULT_NAVIGATION_PREFERENCES)} className="rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold">恢复默认</button>{status && <span className="text-xs text-[var(--muted-foreground)]">{status}</span>}</div>
  </div>;
}
