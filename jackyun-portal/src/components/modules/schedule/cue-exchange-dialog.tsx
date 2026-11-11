'use client';

import { parseCueSourceFields } from '@/lib/learning/cue-source';
import { useMemo, useState } from 'react';
import type { CueBulkOperation, CueStudyDraft, CueReview, StudyCue } from '@/lib/learning/schedule-control';
import { cueExchangeChangedFields, cueExchangeFieldLabels, cueExchangeProgress, matchCueExchange, parseCueExchangeBundle, type CueExchangeMatch } from '@/lib/learning/cue-exchange';

type Row = CueExchangeMatch & { selectedLocalId: string; action: 'add' | 'update' | 'copy' | 'keep' | 'skip' };
const timestamp = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未知';
const display = (value: unknown) => value === undefined || value === null || value === '' ? '（空）' : Array.isArray(value) ? value.join('；') : String(value);

export default function CueExchangeDialog({ cues, reviews, drafts, onClose, onApply }: { cues: StudyCue[]; reviews: CueReview[]; drafts: CueStudyDraft[]; onClose: () => void; onApply: (operations: CueBulkOperation[]) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [exportedAt, setExportedAt] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(cues.map((cue) => [cue.id, cue])), [cues]);

  async function load(file?: File) {
    if (!file) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const bundle = parseCueExchangeBundle(await file.text());
      const matches = matchCueExchange(bundle.cues, cues);
      setRows(matches.map((match) => {
        const local = match.local;
        const action = match.match === 'new' ? 'add' : 'keep';
        return { ...match, selectedLocalId: local?.id ?? '', action };
      }));
      setExportedAt(bundle.exportedAt);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取 CUE 文件。'); }
    finally { setBusy(false); }
  }

  function updateRow(index: number, update: Partial<Row>) {
    setRows((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item));
  }

  function apply() {
    const operations: CueBulkOperation[] = [];
    for (const row of rows) {
      const local = byId.get(row.selectedLocalId);
      if (row.action === 'skip' || row.action === 'keep') continue;
      if (row.action === 'update' && local) {
        operations.push({ ...parseCueSourceFields(row.incoming as unknown as Record<string, unknown>), action: 'update', id: local.id, subjectName: row.incoming.subjectName, unit: row.incoming.unit, subsection: row.incoming.subsection ?? '', prompt: row.incoming.prompt, subtitle: row.incoming.subtitle ?? '', answer: row.incoming.answer ?? '', type: row.incoming.type, display: row.incoming.display ?? 'standard', choices: row.incoming.choices, correctChoice: row.incoming.correctChoice, markingPoints: row.incoming.markingPoints });
      } else if (row.action === 'add' || row.action === 'copy') {
        operations.push({ ...parseCueSourceFields(row.incoming as unknown as Record<string, unknown>), action: 'create', subjectName: row.incoming.subjectName, unit: row.incoming.unit, prompt: row.incoming.prompt, subtitle: row.incoming.subtitle ?? '', answer: row.incoming.answer ?? '', type: row.incoming.type, display: row.incoming.display ?? 'standard', choices: row.incoming.choices, correctChoice: row.incoming.correctChoice, markingPoints: row.incoming.markingPoints });
      }
    }
    if (!operations.length) { setMessage('没有选择需要导入的内容。'); return; }
    onApply(operations);
    setMessage(`已提交 ${operations.length} 项更新；本地学习状态、复习历史和未完成草稿均保留。`);
    setRows([]);
  }

  return <div className="fixed inset-0 z-[95] grid place-items-center bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="cue-exchange-title"><section className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] shadow-2xl"><header className="flex items-start gap-4 border-b border-[var(--card-border)] p-5"><div className="min-w-0 flex-1"><h2 id="cue-exchange-title" className="text-xl font-bold">导入外部 CUE 并逐条对比</h2><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">匹配优先使用 CUE ID，再比较学科、单元和题目。采用外部内容只更新卡片正文，保留本地学习进度。</p></div><button type="button" onClick={onClose} aria-label="关闭" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-black/5">×</button></header><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"><label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand)]">{busy ? '正在读取…' : '选择 CUE 交换 JSON'}<input type="file" accept="application/json,.json" disabled={busy} className="sr-only" onChange={(event) => { void load(event.target.files?.[0]); event.target.value = ''; }} /></label>{rows.length > 0 && <p className="text-xs text-[var(--muted-foreground)]">文件导出时间：{timestamp(exportedAt)} · 导入 {rows.length} 张 · 匹配 {rows.filter((row) => row.local || row.candidates.length > 0).length} 张 · 新增候选 {rows.filter((row) => row.match === 'new').length} 张</p>}{rows.map((row, index) => {
    const local = byId.get(row.selectedLocalId);
    const changed = local ? cueExchangeChangedFields(local, row.incoming) : [];
    const localProgress = local ? cueExchangeProgress(local, reviews, drafts) : undefined;
    const incomingProgress = cueExchangeProgress(row.incoming, [], []);
    const unresolved = row.match === 'ambiguous' && !local;
    return <article key={`${row.incoming.id}-${index}`} className="space-y-3 rounded-2xl border border-[var(--card-border)] p-4"><div className="flex flex-wrap items-center gap-2"><strong className="mr-auto">{row.incoming.prompt}</strong><span className="rounded-full bg-[var(--background)] px-2 py-1 text-xs">{row.match === 'id' ? 'ID 匹配' : row.match === 'content' ? '内容匹配' : row.match === 'ambiguous' ? '疑似重复' : '外部新增'}</span><span className="text-xs text-[var(--muted-foreground)]">外部 v{row.incoming.version ?? '未知'} · {timestamp(row.incoming.updatedAt)}</span></div>{row.match === 'ambiguous' && <label className="block text-sm">疑似相同的本地卡<select value={row.selectedLocalId} onChange={(event) => updateRow(index, { selectedLocalId: event.target.value, action: event.target.value ? 'keep' : 'skip' })} className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3"><option value="">先不匹配</option>{row.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.subjectName} · {candidate.unit} · {candidate.prompt}</option>)}</select></label>}{local ? <div className="grid gap-3 lg:grid-cols-2"><section className="rounded-xl bg-[var(--background)] p-3"><h3 className="text-xs font-bold">本地内容 · v{local.version ?? '未知'} · {timestamp(local.updatedAt)}</h3><p className="mt-2 text-sm">{local.subjectName} · {local.unit}</p>{changed.length ? changed.map((field) => <p key={field} className="mt-2 break-words text-sm"><strong>{cueExchangeFieldLabels[field]}：</strong>{display(local[field])}</p>) : <p className="mt-2 text-sm text-[var(--muted-foreground)]">内容相同</p>}<p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">学习进度：{localProgress!.status} · 复习 {localProgress!.reviewCount} 次 · 上次 {timestamp(localProgress!.lastReviewedAt)} · 下次 {localProgress!.nextReviewDate ?? '未安排'}</p>{localProgress!.draft && <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">未完成学习：第 {localProgress!.draft.position}/{localProgress!.draft.total} 张 · 已揭示 {localProgress!.draft.revealedStepCount} 步 · 草稿更新于 {timestamp(localProgress!.draft.updatedAt)}</p>}</section><section className="rounded-xl bg-[var(--background)] p-3"><h3 className="text-xs font-bold">导入内容 · {row.incoming.subjectName} · {row.incoming.unit}</h3>{changed.length ? changed.map((field) => <p key={field} className="mt-2 break-words text-sm"><strong>{cueExchangeFieldLabels[field]}：</strong>{display(row.incoming[field])}</p>) : <p className="mt-2 text-sm text-[var(--muted-foreground)]">内容相同</p>}<p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">文件内进度：{incomingProgress.status} · 上次 {timestamp(incomingProgress.lastReviewedAt)} · 下次 {incomingProgress.nextReviewDate ?? '未安排'}。应用时不会覆盖本地进度。</p></section></div> : <section className="rounded-xl bg-[var(--background)] p-3 text-sm"><p>外部进度：{incomingProgress.status} · 上次 {timestamp(incomingProgress.lastReviewedAt)} · 下次 {incomingProgress.nextReviewDate ?? '未安排'}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">导入时将创建新的本地 CUE ID；来源 ID 和时间只用于审阅。</p></section>}<label className="flex items-center gap-2 text-sm">处理方式<select value={row.action} onChange={(event) => updateRow(index, { action: event.target.value as Row['action'] })} className="min-h-10 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2"><>{local ? <><option value="keep">保留本地</option><option value="update" disabled={unresolved}>采用外部内容并保留本地进度</option><option value="copy">另存为新卡</option><option value="skip">跳过</option></> : <><option value="add">导入为新卡</option><option value="skip">跳过</option></>}</></select></label></article>;
  })}{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}{message && <p role="status" className="text-sm text-emerald-700">{message}</p>}</div><footer className="flex flex-wrap justify-end gap-3 border-t border-[var(--card-border)] p-4"><button type="button" onClick={onClose} className="min-h-11 rounded-full border border-[var(--card-border)] px-5 text-sm">关闭</button>{rows.length > 0 && <button type="button" onClick={apply} className="min-h-11 rounded-full bg-[var(--brand)] px-5 text-sm font-semibold text-white">应用所选操作</button>}</footer></section></div>;
}
