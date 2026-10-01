'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cueChangeFields, type CueChangeRecord } from '@/lib/learning/cue-change-history';
import type { CueCollectionUpdate } from '@/lib/learning/schedule-control';
import { studyButtonClass, studyInputClass } from './question-bank-manager';

const sourceLabels = { manual: '手动编辑 / 管理', import: 'JSON / AI 导入', memory: '记忆卡导入', lesson: '学习记录新增' };
const actionLabels = { create: '新增', update: '修改', delete: '删除' };
const fieldValue = (value: unknown) => value === null ? '（未设置）' : value === '' ? '（空）' : Array.isArray(value) ? value.join('\n') : String(value);

export default function CueChangeHistory({ records, legacyUpdates, onClose }: { records: CueChangeRecord[]; legacyUpdates: CueCollectionUpdate[]; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    rootRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, []);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [limit, setLimit] = useState(30);
  const filtered = records.filter((record) => (!source || record.source === source) && (!query.trim() || record.changes.some((change) => `${change.subjectName} ${change.unit} ${change.prompt} ${change.cueId}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))).toSorted((a, b) => b.at.localeCompare(a.at));
  return createPortal(<div ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="CUE 修改 / 导入记录" className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 p-2 sm:p-4" onKeyDown={(event) => { if (event.key === 'Tab') { const focusable = [...(rootRef.current?.querySelectorAll<HTMLElement>('button, input, select, summary') ?? [])].filter((element) => element.getClientRects().length > 0); const first = focusable[0], last = focusable.at(-1); if (event.shiftKey && (document.activeElement === first || document.activeElement === rootRef.current)) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === rootRef.current)) { event.preventDefault(); first?.focus(); } } if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <section className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)]">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--card-border)] p-4"><div><h2 className="text-lg font-semibold">CUE 修改 / 导入记录</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">记录功能启用后的内容变更；学习评价保存在学习历史中。旧整批记录仅有数量摘要。</p></div><button className={`${studyButtonClass} shrink-0 whitespace-nowrap`} onClick={onClose}>关闭</button></header>
      <div className="grid gap-2 p-4 sm:grid-cols-2"><label className="text-sm">搜索科目、单元、CUE 或 ID<input type="search" className={studyInputClass} value={query} onChange={(event) => { setQuery(event.target.value); setLimit(30); }} /></label><label className="text-sm">记录来源<select className={studyInputClass} value={source} onChange={(event) => { setSource(event.target.value); setLimit(30); }}><option value="">全部来源</option>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <div className="min-h-0 space-y-3 overflow-y-auto px-4 pb-4"><p className="text-xs text-[var(--muted-foreground)]">{filtered.length} 次操作</p>{filtered.slice(0, limit).map((record) => <article key={record.id} className="rounded-xl border border-[var(--card-border)] p-4"><p className="font-semibold">{sourceLabels[record.source]} · {new Date(record.at).toLocaleString('zh-CN', { hour12: false })}</p><p className="mt-1 text-sm">新增 {record.createdCount} · 修改 {record.modifiedCount} · 删除 {record.deletedCount}</p>{!record.changes.length && <p className="mt-2 text-sm text-[var(--muted-foreground)]">导入已执行，内容没有实际变化。</p>}<div className="mt-3 space-y-2">{record.changes.map((change) => <details key={change.cueId} className="rounded-lg bg-black/5 p-3 dark:bg-white/5"><summary className="cursor-pointer break-words text-sm">{actionLabels[change.action]} · {change.subjectName} / {change.unit} · {change.prompt}</summary><p className="mt-2 break-all text-xs text-[var(--muted-foreground)]">ID：{change.cueId} · 版本 {change.beforeVersion ?? '—'} → {change.afterVersion ?? '—'}</p>{change.fields.map((field) => <div key={field.field} className="mt-3"><p className="text-xs font-semibold">{cueChangeFields[field.field]}</p><div className="mt-1 grid gap-2 sm:grid-cols-2"><div className="min-w-0 rounded-lg border border-[var(--card-border)] p-2"><p className="text-xs text-[var(--muted-foreground)]">变更前</p><p className="whitespace-pre-wrap break-words text-sm">{fieldValue(field.before)}</p></div><div className="min-w-0 rounded-lg border border-[var(--card-border)] p-2"><p className="text-xs text-[var(--muted-foreground)]">变更后</p><p className="whitespace-pre-wrap break-words text-sm">{fieldValue(field.after)}</p></div></div></div>)}</details>)}</div></article>)}{filtered.length > limit && <button className={studyButtonClass} onClick={() => setLimit((value) => value + 30)}>显示更多记录</button>}{!filtered.length && <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">暂无匹配记录。新的修改与导入会自动记录。</p>}
      {!query && !source && legacyUpdates.length > 0 && <details><summary className="cursor-pointer text-sm">已有整批更新摘要（{legacyUpdates.length} 条）</summary><div className="mt-2 space-y-2">{legacyUpdates.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((update) => <p key={update.id} className="rounded-lg border border-[var(--card-border)] p-3 text-sm">{update.subjectName} · {new Date(update.updatedAt).toLocaleString('zh-CN', { hour12: false })} · 新增 {update.createdCount} / 修改 {update.modifiedCount} · 总计 {update.totalCueCount} 条</p>)}</div></details>}
      </div>
    </section>
  </div>, document.body);
}
