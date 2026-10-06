'use client';

import { useCallback, useEffect, useState } from 'react';
import { createNotification, deleteNotification, getAllNotifications, updateNotification, type NotificationInput } from '@/actions/admin';
import type { SiteNotification } from '@/types';
import { ANNOUNCEMENT_CATEGORIES, ANNOUNCEMENT_PAGES, ANNOUNCEMENT_PRIORITIES, INCIDENT_STATUSES, announcementLocalTime, announcementMatchesPath, announcementPhase, sortAnnouncements, validateAnnouncement } from '@/lib/announcements';
import { AnnouncementBadge, AnnouncementAction } from '@/components/modules/announcement-content';
import MarkdownRenderer from '@/components/modules/markdown-renderer';

type Form = Omit<NotificationInput, 'start_time' | 'end_time'> & { start_time: string; end_time: string; custom_paths: string };
const EMPTY_FORM: Form = { title: '', content: '', content_type: 'markdown', delivery_type: 'banner', is_active: true, start_time: '', end_time: '', category: 'general', priority: 'normal', is_pinned: false, scope_type: 'global', target_paths: [], incident_status: 'none', action_label: '', action_url: '', custom_paths: '', notify_again: false };
const PHASES = { live: '展示中', scheduled: '待发布', expired: '已过期', disabled: '已停用' };
const control = 'w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-blue-500';
const button = 'rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-medium hover:bg-[var(--background)] disabled:opacity-50';
function toInput(form: Form): NotificationInput {
  return validateAnnouncement({ ...form, target_paths: [...(form.target_paths ?? []), ...form.custom_paths.split(/[\n,，]/).map(path => path.trim()).filter(Boolean)], start_time: form.start_time ? new Date(form.start_time).toISOString() : null, end_time: form.end_time ? new Date(form.end_time).toISOString() : null });
}
function toForm(item: SiteNotification): Form {
  return { ...EMPTY_FORM, ...item, custom_paths: '', target_paths: item.target_paths ?? [], start_time: announcementLocalTime(item.start_time), end_time: announcementLocalTime(item.end_time), notify_again: false };
}
export function NotificationManagerPanel() {
  const [items, setItems] = useState<SiteNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewPath, setPreviewPath] = useState('/schedule');
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await getAllNotifications()); } catch (error) { setError(error instanceof Error ? error.message : '加载失败'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);
  const start = (item?: SiteNotification) => { setEditingId(item?.id ?? null); setForm(item ? toForm(item) : EMPTY_FORM); setPreview(false); setError(''); setOpen(true); };
  const save = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const input = toInput(form);
      const result = editingId ? await updateNotification(editingId, input) : await createNotification(input);
      if (!result.success) throw new Error(result.error ?? '保存失败');
      setOpen(false); setSuccess(input.start_time && Date.parse(input.start_time) > Date.now() ? '公告已排期，到时自动展示' : '公告已保存'); await load();
    } catch (error) { setError(error instanceof Error ? error.message : '保存失败'); } finally { setSaving(false); }
  };
  const changeActive = async (item: SiteNotification) => {
    setError('');
    try { const result = await updateNotification(item.id, { ...toInput(toForm(item)), is_active: !item.is_active }); if (!result.success) throw new Error(result.error); await load(); } catch (error) { setError(error instanceof Error ? error.message : '操作失败'); }
  };
  const remove = async (item: SiteNotification) => {
    if (!window.confirm('删除后不可恢复。保留历史请使用“停用”。确定删除？')) return;
    setError('');
    try { const result = await deleteNotification(item.id); if (!result.success) throw new Error(result.error); await load(); } catch (error) { setError(error instanceof Error ? error.message : '删除失败'); }
  };
  const visible = sortAnnouncements(items).filter(item => (category === 'all' || item.category === category || (!item.category && category === 'general')) && (filter === 'all' || (filter === 'history' ? ['disabled', 'expired'].includes(announcementPhase(item)) : announcementPhase(item) === filter)) && `${item.title} ${item.content}`.toLowerCase().includes(search.toLowerCase()));
  let previewItem: SiteNotification | null = null;
  let previewError = '';
  if (preview) { try { previewItem = { ...toInput(form), id: 'preview', created_at: new Date().toISOString(), updated_at: '', created_by: null, recipient_user_id: null, related_ticket_id: null }; } catch (error) { previewError = error instanceof Error ? error.message : '请检查表单'; } }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-xs leading-5 text-[var(--muted-foreground)]">按分类、页面和有效期投递。横幅适合维护与故障提示；弹窗用于重要通知。工单私信独立保留。</p><button type="button" onClick={() => start()} className="rounded-lg bg-[#4285F4] px-4 py-2 text-sm font-semibold text-white">新建公告</button></div>
    {success && <p role="status" className="rounded-lg bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300">{success}</p>}
    {error && !open && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
    <div className="flex flex-wrap gap-2">{[['all', '全部'], ['live', '展示中'], ['scheduled', '待发布'], ['history', '历史 / 停用']].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`${button} ${filter === value ? 'border-blue-500 bg-blue-500/10 text-blue-600' : ''}`}>{label}</button>)}<select aria-label="筛选公告分类" value={category} onChange={event => setCategory(event.target.value)} className={`${control} w-auto`}><option value="all">全部分类</option>{Object.entries(ANNOUNCEMENT_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label="搜索公告" placeholder="搜索标题或内容" value={search} onChange={event => setSearch(event.target.value)} className={`${control} min-w-40 flex-1`} /></div>
    {loading ? <p className="py-6 text-sm text-[var(--muted-foreground)]">加载中…</p> : !visible.length ? <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">暂无符合条件的公告</p> : visible.map(item => <article key={item.id} className="rounded-xl border border-[var(--card-border)] p-4">
      <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0 flex-1"><AnnouncementBadge notification={item} /><h3 className="mt-2 break-words font-semibold">{item.title || '无标题'}</h3><p className="mt-1 line-clamp-2 break-words text-xs text-[var(--muted-foreground)]">{item.content}</p></div><div className="flex items-start gap-2"><button type="button" className={button} onClick={() => start(item)}>编辑 / 预览</button><button type="button" className={button} onClick={() => changeActive(item)}>{item.is_active ? '停用' : '启用'}</button><button type="button" className={`${button} text-red-600`} onClick={() => remove(item)}>删除</button></div></div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--muted-foreground)]"><span>{PHASES[announcementPhase(item)]}</span><span>· {item.delivery_type === 'banner' ? '页面横幅' : item.delivery_type === 'message' ? '仅通知中心' : '弹窗'}</span><span>· {item.scope_type === 'pages' ? (item.target_paths ?? []).join('、') : '全局显示'}</span><span>· {item.start_time ? new Date(item.start_time).toLocaleString('zh-CN') : '立即生效'} → {item.end_time ? new Date(item.end_time).toLocaleString('zh-CN') : '长期有效'}</span></div>
    </article>)}
    {open && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-3" onClick={event => { if (event.target === event.currentTarget && !saving) setOpen(false); }}><div role="dialog" aria-modal="true" aria-labelledby="announcement-editor-title" className="flex max-h-[92dvh] w-full max-w-4xl flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl" onKeyDown={event => {
      event.stopPropagation(); if (event.key === 'Escape' && !saving) setOpen(false);
      if (event.key === 'Tab') { const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('input, select, textarea, button, a[href]')].filter(control => !control.hasAttribute('disabled')); if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); } else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); } }
    }}>
      <header className="flex items-center justify-between border-b border-[var(--card-border)] p-4"><h2 id="announcement-editor-title" className="font-bold">{editingId ? '编辑公告' : '新建公告'}</h2><div className="flex gap-2"><button type="button" className={button} aria-pressed={preview} onClick={() => setPreview(value => !value)}>{preview ? '返回编辑' : '预览效果'}</button><button type="button" disabled={saving} onClick={() => setOpen(false)} className={button}>关闭</button></div></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
        {preview ? <section className="space-y-4"><label className="block text-xs font-medium">预览所在页面<input className={`${control} mt-1`} value={previewPath} onChange={event => setPreviewPath(event.target.value)} /></label>{previewError && <p role="alert" className="text-sm text-red-600">{previewError}</p>}{previewItem && <><p className="text-xs text-[var(--muted-foreground)]">{announcementMatchesPath(previewItem, previewPath) ? '此页面在显示范围内' : '此页面不在显示范围内'} · {PHASES[announcementPhase(previewItem)]} · {previewItem.delivery_type === 'banner' ? '页面横幅' : previewItem.delivery_type === 'notice' ? '弹窗' : '通知中心'}</p><article className={`rounded-xl border border-[var(--card-border)] p-5 ${previewItem.delivery_type === 'banner' ? 'border-l-4 border-l-blue-500' : ''}`}><AnnouncementBadge notification={previewItem} /><h3 className="my-3 text-lg font-semibold">{previewItem.title}</h3><MarkdownRenderer content={previewItem.content} /><AnnouncementAction notification={previewItem} /></article><p className="text-xs text-[var(--muted-foreground)]">预览不会发布，也不会产生已读记录。</p></>}</section> : <>
          <label className="block text-xs font-medium">标题<input autoFocus value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} className={`${control} mt-1`} /></label>
          <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-medium">分类<select className={`${control} mt-1`} value={form.category} onChange={event => setForm({ ...form, category: event.target.value as Form['category'] })}>{Object.entries(ANNOUNCEMENT_CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-medium">优先级<select className={`${control} mt-1`} value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value as Form['priority'] })}>{Object.entries(ANNOUNCEMENT_PRIORITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-medium">展示方式<select className={`${control} mt-1`} value={form.delivery_type} onChange={event => setForm({ ...form, delivery_type: event.target.value as Form['delivery_type'] })}><option value="banner">页面横幅 + 通知中心</option><option value="notice">弹窗 + 通知中心</option><option value="message">仅通知中心</option></select></label></div>
          <div className="rounded-xl border border-[var(--card-border)] p-4"><div className="flex items-center gap-4 text-sm"><span className="font-semibold">显示范围</span>{[['global', '全局'], ['pages', '指定页面']].map(([value, label]) => <label key={value} className="flex items-center gap-2"><input type="radio" name="announcement-scope" checked={form.scope_type === value} onChange={() => setForm({ ...form, scope_type: value as Form['scope_type'] })} />{label}</label>)}</div>{form.scope_type === 'pages' && <><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{ANNOUNCEMENT_PAGES.map(([path, label]) => <label key={path} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.target_paths?.includes(path)} onChange={event => setForm({ ...form, target_paths: event.target.checked ? [...(form.target_paths ?? []), path] : form.target_paths?.filter(value => value !== path) })} />{label}</label>)}</div>{(form.target_paths ?? []).filter(path => !ANNOUNCEMENT_PAGES.some(([preset]) => preset === path)).map(path => <label className="mt-2 flex gap-2 text-xs" key={path}><input type="checkbox" checked onChange={() => setForm({ ...form, target_paths: form.target_paths?.filter(value => value !== path) })} />{path}</label>)}<label className="mt-3 block text-xs">更多页面路径（逗号或换行分隔）<textarea rows={2} className={`${control} mt-1`} placeholder="/ielts, /answer-sheet" value={form.custom_paths} onChange={event => setForm({ ...form, custom_paths: event.target.value })} /></label><p className="mt-2 text-xs text-[var(--muted-foreground)]">包含所选页面及子页面，例如 /study 同时包含 /study/tasks。</p></>}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">故障 / 维护状态<select className={`${control} mt-1`} value={form.incident_status} onChange={event => setForm({ ...form, incident_status: event.target.value as Form['incident_status'] })}>{Object.entries(INCIDENT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-medium">内容格式<select className={`${control} mt-1`} value={form.content_type} onChange={event => setForm({ ...form, content_type: event.target.value as Form['content_type'] })}><option value="markdown">Markdown</option><option value="html">HTML（自动安全过滤）</option></select></label></div>
          <label className="block text-xs font-medium">公告内容<textarea rows={7} className={`${control} mt-1 font-mono`} value={form.content} onChange={event => setForm({ ...form, content: event.target.value })} placeholder="说明影响、预计恢复时间和可用的替代方式…" /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">操作按钮文字<input className={`${control} mt-1`} value={form.action_label ?? ''} onChange={event => setForm({ ...form, action_label: event.target.value })} placeholder="查看替代工具" /></label><label className="text-xs font-medium">操作链接<input className={`${control} mt-1`} value={form.action_url ?? ''} onChange={event => setForm({ ...form, action_url: event.target.value })} placeholder="/tools 或 https://…" /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">开始时间<input type="datetime-local" value={form.start_time} onChange={event => setForm({ ...form, start_time: event.target.value })} className={`${control} mt-1`} /></label><label className="text-xs font-medium">结束时间<input type="datetime-local" value={form.end_time} onChange={event => setForm({ ...form, end_time: event.target.value })} className={`${control} mt-1`} /></label></div><p className="text-xs text-[var(--muted-foreground)]">按本机时区保存。留空表示立即生效 / 长期有效；到开始时间自动发布，到结束时间自动停止展示。</p>
          <div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={event => setForm({ ...form, is_active: event.target.checked })} />启用公告</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.is_pinned === true} onChange={event => setForm({ ...form, is_pinned: event.target.checked })} />置顶</label>{editingId && <label className="flex items-center gap-2"><input type="checkbox" checked={form.notify_again === true} onChange={event => setForm({ ...form, notify_again: event.target.checked })} />重新提醒已读用户</label>}</div>{editingId && <p className="text-xs text-[var(--muted-foreground)]">故障恢复后可改为“已恢复”，勾选“重新提醒已读用户”发布恢复通知。普通编辑会保留已读状态。</p>}
        </>}
      </div><footer className="flex justify-end gap-2 border-t border-[var(--card-border)] p-4"><button type="button" className={button} disabled={saving} onClick={() => setOpen(false)}>取消</button><button type="button" onClick={save} disabled={saving} className="rounded-lg bg-[#4285F4] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? '保存中…' : '保存公告'}</button></footer>
    </div></div>}
  </div>;
}
