'use client';

import { useMemo, useState } from 'react';
import type { CueBulkOperation, CueStudyDraft, CueReview, StudyCue } from '@/lib/learning/schedule-control';
import { buildCueExchangeOperations, CUE_EXCHANGE_CONTENT_FIELDS, cueExchangeChangedFields, cueExchangeFieldLabels, cueExchangeProgress, matchCueExchange, parseCueExchangeBundle, type CueExchangeContentField, type CueExchangeMatch, type CueExchangeSelection } from '@/lib/learning/cue-exchange';

type Row = CueExchangeMatch & CueExchangeSelection;
const matchLabels: Record<Row['match'], string> = { id: 'ID 匹配', content: '内容匹配', ambiguous: '疑似重复', new: '外部新增' };
const timestamp = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未知';
const secondaryButton = 'inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--card-border)] px-4 text-sm font-semibold disabled:opacity-40';
const primaryButton = 'min-h-11 rounded-full bg-[var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-40';

function displayField(cue: StudyCue, field: CueExchangeContentField) {
  const value = cue[field];
  if (value === undefined || value === null || value === '') return '（空）';
  if (field === 'correctChoice' && typeof value === 'number') return `第 ${value + 1} 项`;
  if (Array.isArray(value)) return value.map((item, index) => `${index + 1}. ${item}`).join('\n') || '（空）';
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}

export default function CueExchangeDialog({ cues, reviews, drafts, onClose, onApply }: {
  cues: StudyCue[];
  reviews: CueReview[];
  drafts: CueStudyDraft[];
  onClose: () => void;
  onApply: (operations: CueBulkOperation[]) => { createdCount: number; modifiedCount: number };
}) {
  const [json, setJson] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState('');
  const [exportedAt, setExportedAt] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(cues.map((cue) => [cue.id, cue])), [cues]);

  function resetPreview() {
    setRows([]);
    setError('');
    setMessage('');
  }

  function preview(text: string, label: string) {
    resetPreview();
    try {
      const bundle = parseCueExchangeBundle(text);
      setRows(matchCueExchange(bundle.cues, cues).map((match) => ({
        ...match,
        selectedLocalId: match.local?.id ?? '',
        action: match.match === 'new' ? 'add' : match.match === 'ambiguous' ? 'skip' : 'keep',
      })));
      setExportedAt(bundle.exportedAt);
      setSource(label);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法预览 CUE。');
    }
  }

  async function upload(file: File) {
    resetPreview();
    setJson('');
    setBusy(true);
    try {
      preview(await file.text(), file.name);
    } catch {
      setError('无法读取文件，请重新选择 JSON 文件。');
    } finally {
      setBusy(false);
    }
  }

  function updateRow(index: number, update: Partial<CueExchangeSelection>) {
    setError('');
    setRows((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item));
  }

  function apply() {
    setError('');
    try {
      const operations = buildCueExchangeOperations(rows, byId);
      if (!operations.length) {
        setError('没有可应用的修改，请检查所选操作。');
        return;
      }
      const { createdCount, modifiedCount } = onApply(operations);
      setMessage(`已应用：新增 ${createdCount} 张，修改 ${modifiedCount} 张。`);
      setRows([]);
      setJson('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法应用所选操作。');
    }
  }

  const selected = rows.filter(({ action }) => action === 'add' || action === 'copy' || action === 'update').length;
  return (
    <div className="fixed inset-0 z-[95] grid grid-cols-[minmax(0,1fr)] place-items-center bg-black/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="cue-exchange-title">
      <section className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] shadow-2xl">
        <header className="flex items-start gap-4 border-b border-[var(--card-border)] p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <h2 id="cue-exchange-title" className="text-xl font-bold">导入外部 CUE 并逐条对比</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">优先按 CUE ID 匹配，再比较学科、单元和题目。更新卡片会保留本地学习进度。</p>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭导入窗口" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-black/5">×</button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <div className="space-y-2">
            <label htmlFor="cue-exchange-json" className="block text-sm font-semibold">粘贴 CUE JSON</label>
            <textarea
              id="cue-exchange-json"
              rows={4}
              value={json}
              disabled={busy}
              spellCheck={false}
              placeholder="粘贴交换 JSON 或 AI 返回的完整 JSON 代码块"
              onChange={(event) => { setJson(event.target.value); resetPreview(); }}
              className="block w-full resize-y rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 font-mono text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => preview(json, '粘贴的 JSON')} disabled={busy || !json.trim()} className={primaryButton}>预览粘贴内容</button>
              <label className={`${secondaryButton} relative focus-within:ring-2 focus-within:ring-[var(--brand)] ${busy ? 'opacity-40' : 'cursor-pointer'}`}>
                {busy ? '正在读取…' : '上传 JSON 文件'}
                <input type="file" accept="application/json,.json" disabled={busy} className="sr-only" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = '';
                }} />
              </label>
            </div>
            {!rows.length && error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
            {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
          </div>
          {rows.length > 0 && (
            <p role="status" className="break-words rounded-xl bg-[var(--background)] p-3 text-sm">
              {source} · 待核对 {rows.length} 张 · 新卡候选 {rows.filter((row) => row.match === 'new').length} 张
              {exportedAt && ` · 导出于 ${timestamp(exportedAt)}`}
            </p>
          )}
          {rows.map((row, index) => {
            const local = byId.get(row.selectedLocalId);
            const changed = local ? cueExchangeChangedFields(local, row.incoming) : [];
            const localProgress = local ? cueExchangeProgress(local, reviews, drafts) : undefined;
            const incomingProgress = cueExchangeProgress(row.incoming, [], []);
            const fields = local ? changed : CUE_EXCHANGE_CONTENT_FIELDS.filter((field) => row.incoming[field] !== undefined && row.incoming[field] !== '');
            return (
              <article key={row.incoming.id} className="space-y-3 rounded-2xl border border-[var(--card-border)] p-4">
                <div className="flex flex-wrap items-start gap-2">
                  <h3 className="min-w-0 flex-1 break-words font-semibold">{row.incoming.prompt}</h3>
                  <span className="rounded-full bg-[var(--background)] px-2 py-1 text-xs">{matchLabels[row.match]}</span>
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">{row.incoming.subjectName} · {row.incoming.unit} · 外部版本 {row.incoming.version ?? '未知'} · {timestamp(row.incoming.updatedAt)}</p>
                {row.match === 'ambiguous' && (
                  <label className="block text-sm">
                    选择要比较的本地卡片
                    <select value={row.selectedLocalId} onChange={(event) => updateRow(index, { selectedLocalId: event.target.value, action: event.target.value ? 'keep' : 'skip' })} className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3">
                      <option value="">先不匹配</option>
                      {row.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.subjectName} · {candidate.unit} · {candidate.subsection || '无章节'} · {candidate.prompt}（{candidate.id}）</option>)}
                    </select>
                  </label>
                )}
                {fields.length ? (
                  <dl className="divide-y divide-[var(--card-border)] overflow-hidden rounded-xl bg-[var(--background)] text-sm">
                    {fields.map((field) => (
                      <div key={field} className="grid gap-1 p-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3">
                        <dt className="font-semibold">{cueExchangeFieldLabels[field]}</dt>
                        <dd className={`grid min-w-0 gap-2 ${local ? 'sm:grid-cols-2' : ''}`}>
                          {local && <div className="min-w-0 whitespace-pre-wrap break-words"><span className="block text-xs text-[var(--muted-foreground)]">本地</span><span>{displayField(local, field)}</span></div>}
                          <div className="min-w-0 whitespace-pre-wrap break-words">{local && <span className="block text-xs font-semibold text-[var(--brand)]">外部</span>}<span>{displayField(row.incoming, field)}</span></div>
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : <p className="text-sm text-[var(--muted-foreground)]">内容相同</p>}
                <div className="space-y-1 text-xs leading-5 text-[var(--muted-foreground)]">
                  {local && localProgress && <>
                    <p>本地 v{local.version ?? '未知'} · {timestamp(local.updatedAt)} · {localProgress.status} · 复习 {localProgress.reviewCount} 次 · 上次 {timestamp(localProgress.lastReviewedAt)} · 下次 {localProgress.nextReviewDate ?? '未安排'}</p>
                    {localProgress.draft && <p>未完成学习：第 {localProgress.draft.position}/{localProgress.draft.total} 张 · 已揭示 {localProgress.draft.revealedStepCount} 步 · {timestamp(localProgress.draft.updatedAt)}</p>}
                  </>}
                  {(row.incoming.status || row.incoming.lastReviewedAt || row.incoming.nextReviewDate) && <p>外部进度仅供参考 · {incomingProgress.status} · 上次 {timestamp(incomingProgress.lastReviewedAt)} · 下次 {incomingProgress.nextReviewDate ?? '未安排'}</p>}
                </div>
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  处理方式
                  <select value={row.action} onChange={(event) => updateRow(index, { action: event.target.value as Row['action'] })} className="min-h-10 max-w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2">
                    {local ? <>
                      <option value="keep">保留本地</option>
                      <option value="update" disabled={!changed.length}>采用外部内容</option>
                      <option value="copy">另存为新卡</option>
                    </> : <option value="add">导入为新卡</option>}
                    <option value="skip">跳过</option>
                  </select>
                </label>
              </article>
            );
          })}
        </div>
        <footer className="border-t border-[var(--card-border)] p-4">
          {rows.length > 0 && error && <p role="alert" className="mb-3 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className={secondaryButton}>关闭</button>
            {rows.length > 0 && <>
              <span className="mr-auto self-center text-sm text-[var(--muted-foreground)]">已选 {selected} 项操作</span>
              <button type="button" onClick={apply} disabled={!selected || busy} className={primaryButton}>应用所选操作</button>
            </>}
          </div>
        </footer>
      </section>
    </div>
  );
}
