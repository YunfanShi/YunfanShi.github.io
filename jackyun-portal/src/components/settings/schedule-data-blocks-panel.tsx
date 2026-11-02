'use client';

import { useState } from 'react';
import { siteConfirm } from '@/lib/site-dialog';
import { captureRepositoryContext, workspaceStorage } from '@/lib/sync/repository';
import { CLOUD_STATE_APPLIED_EVENT } from '@/lib/local-workspace';
import { localPageValues, saveLocalBackup } from '@/lib/backup/local';
import { SCHEDULE_DATA_BLOCKS, createScheduleDataBlockBundle, parseScheduleDataBlockBundle, scheduleDataBlockReplacement, type ScheduleDataBlock, type ScheduleDataBlockBundle } from '@/lib/backup/schedule-blocks';

const date = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未知';

export default function ScheduleDataBlocksPanel({ owner }: { owner: string }) {
  const [block, setBlock] = useState<ScheduleDataBlock>('cues');
  const [preview, setPreview] = useState<ScheduleDataBlockBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const snapshot = () => workspaceStorage.snapshot();

  function download() {
    const bundle = createScheduleDataBlockBundle(block, snapshot());
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `jackyun-schedule-${block}-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function read(file?: File) {
    if (!file) return;
    setPreview(null); setMessage(''); setError('');
    try { setPreview(parseScheduleDataBlockBundle(await file.text(), block)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取数据块文件。'); }
  }

  async function apply() {
    if (!preview) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const repo = await captureRepositoryContext();
      if (repo.owner !== (owner === 'guest' ? null : owner)) throw new Error('本机账号已变化，请刷新页面后重新操作。');
      const currentSnapshot = snapshot();
      const current = createScheduleDataBlockBundle(block, currentSnapshot);
      const label = SCHEDULE_DATA_BLOCKS.find((item) => item.id === block)?.label ?? block;
      if (!(await siteConfirm(`将文件中的 ${preview.count} 项“${label}”替换本机当前 ${current.count} 项？文件导出时间：${date(preview.exportedAt)}；数据更新时间：${date(preview.dataUpdatedAt)}。只替换此数据块，其他 Schedule 数据保留。操作前会保存 Schedule 恢复点。`))) return;
      repo.assertCurrent();
      await saveLocalBackup(owner, 'schedule', localPageValues(currentSnapshot, 'schedule'), true);
      repo.assertCurrent();
      const replacement = scheduleDataBlockReplacement(preview, snapshot());
      workspaceStorage.setItem(replacement.key, replacement.value);
      await workspaceStorage.flush();
      repo.assertCurrent();
      window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT, { detail: { keys: [replacement.key], source: 'schedule-block-import' } }));
      window.dispatchEvent(new Event('jackyun-sync-retry'));
      setMessage(`已替换“${label}”，并保存了导入前的 Schedule 恢复点。`);
      setPreview(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '导入失败。'); }
    finally { setBusy(false); }
  }

  const label = SCHEDULE_DATA_BLOCKS.find((item) => item.id === block)?.label ?? block;
  const currentCount = createScheduleDataBlockBundle(block, snapshot()).count;
  return <section className="space-y-3 rounded-2xl border border-[var(--brand)]/30 bg-[var(--background)] p-4"><div><h3 className="font-semibold">Schedule 分块导出与恢复</h3><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">选择单独的数据块。文件包含导出时间、数据更新时间和条目数量；恢复只覆盖所选块。</p></div><div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs">数据块<select value={block} disabled={busy} onChange={(event) => { setBlock(event.target.value as ScheduleDataBlock); setPreview(null); setError(''); }} className="min-h-10 rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm">{SCHEDULE_DATA_BLOCKS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><span className="text-xs text-[var(--muted-foreground)]">本机当前 {currentCount} 项</span><button type="button" disabled={busy} onClick={download} className="min-h-10 rounded-lg border border-[var(--card-border)] px-3 text-sm">导出此数据块</button><label className={`min-h-10 cursor-pointer rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm ${busy ? 'pointer-events-none opacity-50' : ''}`}>选择导入文件<input type="file" accept="application/json,.json" disabled={busy} className="sr-only" onChange={(event) => { void read(event.target.files?.[0]); event.target.value = ''; }} /></label></div>{preview && <div className="rounded-xl border border-amber-400/50 bg-amber-50/60 p-3 text-sm dark:bg-amber-950/20"><strong>导入预览 · {label}</strong><p className="mt-1">本机 {currentCount} 项 → 文件 {preview.count} 项</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">文件导出时间：{date(preview.exportedAt)} · 数据更新时间：{date(preview.dataUpdatedAt)}</p><button type="button" disabled={busy} onClick={() => void apply()} className="mt-3 min-h-10 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white">确认替换此数据块</button></div>}{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}{message && <p role="status" className="text-sm text-emerald-700">{message}</p>}</section>;
}
