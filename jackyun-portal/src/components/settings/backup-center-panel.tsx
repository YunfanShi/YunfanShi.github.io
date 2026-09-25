'use client';

import { useCallback, useEffect, useState } from 'react';
import { createBackupVersion, downloadBackupVersion, listBackupVersions, restoreBackupVersion, type BackupVersion } from '@/actions/backup-center';
import { BACKUP_PAGES, isBackupableLegacyKey, legacyBackupPage, type BackupPage } from '@/lib/backup/pages';
import { CLOUD_STATE_APPLIED_EVENT, storageValueToString } from '@/lib/local-workspace';
import { getOutbox, getSetting, removeOperation, saveMetadata } from '@/lib/sync/outbox';
import { listLocalBackups, localPageValues, saveLocalBackup, type LocalBackup } from '@/lib/backup/local';
import { scheduleHasContent, SCHEDULE_STORAGE_KEY } from '@/lib/sync/schedule-safety';

const REASONS: Record<BackupVersion['reason'], string> = {
  automatic: '自动', baseline: '初始', before_restore: '恢复前', manual: '手动',
};

function scheduleSummary(value: unknown): string | null {
  let data = value;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return null; }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const state = data as Record<string, unknown>;
  const counts = [['Cue', 'cues'], ['手动任务', 'manualTasks'], ['学习记录', 'learningRecords']]
    .filter(([, key]) => Array.isArray(state[key]))
    .map(([label, key]) => `${label} ${(state[key] as unknown[]).length}`);
  return counts.length ? counts.join('、') : null;
}

export default function BackupCenterPanel({ userId, cloudEnabled = true }: { userId: string; cloudEnabled?: boolean }) {
  const [page, setPage] = useState<BackupPage>('schedule');
  const [versions, setVersions] = useState<BackupVersion[]>([]);
  const [localOwner, setLocalOwner] = useState(userId);
  const [localVersions, setLocalVersions] = useState<LocalBackup[]>([]);
  const [preview, setPreview] = useState<{ id: number; details: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const owner = userId === 'guest' ? await getSetting<string>('activeUserId').catch(() => null) ?? 'guest' : userId;
    setLocalOwner(owner);
    const [local, cloud] = await Promise.allSettled([
      listLocalBackups(owner, page),
      cloudEnabled ? listBackupVersions(page) : Promise.resolve([]),
    ]);
    if (local.status === 'fulfilled') setLocalVersions(local.value);
    if (cloud.status === 'fulfilled') setVersions(cloud.value);
    const failure = [local, cloud].find((result) => result.status === 'rejected');
    setError(failure?.status === 'rejected' ? String(failure.reason instanceof Error ? failure.reason.message : failure.reason) : '');
  }, [page, userId, cloudEnabled]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function run(task: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await task(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败。'); }
    finally { setBusy(false); }
  }

  async function download(id: number) {
    await run(async () => {
      const archive = await downloadBackupVersion(id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `jackyun-${page}-${id}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  async function inspect(id: number) {
    await run(async () => {
      const archive = await downloadBackupVersion(id);
      const details = Object.entries(archive.tables).filter(([, rows]) => Array.isArray(rows) && rows.length)
        .map(([table, rows]) => `${table}: ${(rows as unknown[]).length} 项`);
      const legacy = archive.tables.legacy_sync_data as Array<{ storage_key?: string; storage_value?: unknown }> | undefined;
      if (legacy?.length) details.push(`本地数据键: ${legacy.map((row) => row.storage_key).filter(Boolean).join('、')}`);
      const schedule = legacy?.find((row) => row.storage_key === SCHEDULE_STORAGE_KEY);
      const summary = scheduleSummary(schedule?.storage_value);
      if (summary) details.push(summary);
      setPreview({ id, details: details.length ? details : ['此版本没有记录。'] });
    });
  }

  async function restore(id: number) {
    if (!window.confirm('将这个页面的备份数据合并回当前账户？系统会先保存当前页面版本，新增于备份之后的记录会保留。')) return;
    await run(async () => {
      const result = await restoreBackupVersion(id);
      const pending = await getOutbox();
      const keys: string[] = [];
      for (const record of result.legacyRecords) {
        for (const operation of pending) if (operation.key === record.key) await removeOperation(operation.id);
        if (record.deleted) localStorage.removeItem(record.key);
        else localStorage.setItem(record.key, storageValueToString(record.value));
        await saveMetadata(record);
        keys.push(record.key);
      }
      if (keys.length) window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT, { detail: { keys } }));
      setMessage(`已恢复${BACKUP_PAGES.find((item) => item.id === result.page)?.label ?? '页面'}，恢复前版本已保存。刷新页面可查看结果。`);
      await load();
    });
  }

  async function applyLocal(item: LocalBackup) {
    const current: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && isBackupableLegacyKey(key) && legacyBackupPage(key) === item.page) {
        const value = localStorage.getItem(key);
        if (value !== null) current[key] = value;
      }
    }
    await saveLocalBackup(localOwner, item.page, localPageValues(current, item.page));
    for (const key of Object.keys(current)) if (!(key in item.values)) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(item.values)) {
      if (!isBackupableLegacyKey(key) || legacyBackupPage(key) !== item.page) throw new Error('本地备份包含不允许恢复的键。');
      localStorage.setItem(key, value);
    }
    window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT, { detail: { keys: Object.keys(item.values) } }));
    window.dispatchEvent(new Event('jackyun-sync-retry'));
    setMessage('本地页面已恢复到所选版本，原状态已先保存；联网后会按现有同步规则处理。');
    await load();
  }

  async function restoreLocal(item: LocalBackup) {
    if (!window.confirm('把这个浏览器中的页面版本恢复到当前设备？当前本地页面会先保存，修改随后按现有同步规则上传。')) return;
    await run(() => applyLocal(item));
  }

  function downloadLocal(item: LocalBackup) {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, page: item.page, createdAt: item.createdAt, values: item.values }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `jackyun-local-${item.page}-${item.id}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function uploadLocal(file?: File) {
    if (!file) return;
    await run(async () => {
      if (file.size > 1_000_000) throw new Error('本地页面文件不能超过 1 MB。');
      const parsed = JSON.parse(await file.text()) as Partial<LocalBackup> & { version?: number };
      if (parsed.version !== 1 || parsed.page !== page || !parsed.values || typeof parsed.values !== 'object'
        || Array.isArray(parsed.values) || !Object.keys(parsed.values).length) throw new Error('文件不是当前页面的本地备份。');
      for (const [key, value] of Object.entries(parsed.values)) {
        if (typeof value !== 'string' || !isBackupableLegacyKey(key) || legacyBackupPage(key) !== page) throw new Error(`不允许导入的页面数据键：${key}`);
        if (key === SCHEDULE_STORAGE_KEY) {
          let schedule: unknown;
          try { schedule = JSON.parse(value); } catch { throw new Error('Schedule JSON 格式错误。'); }
          if (!scheduleHasContent(schedule)) throw new Error('拒绝导入空 Schedule。');
        }
      }
      if (!window.confirm('导入编辑后的页面 JSON？当前本地页面会先保存。')) return;
      await applyLocal({ id: -1, userId: localOwner, page, createdAt: new Date().toISOString(), values: parsed.values });
    });
  }

  return <div className="space-y-4">
    <p className="text-sm leading-6 text-[var(--muted-foreground)]">有修改时，此设备每 5 分钟保存一次页面版本，每页保留最近 10 个；云端每 15 分钟最多自动保存一次，每页保留 5 个。页面打开且同步成功后才会检查云端待备份内容。故障前的云端历史暂时保留，供你先检查和恢复。恢复前会保存当前版本。本地版本只在此浏览器可用，重要版本请下载文件另存。</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">页面
        <select value={page} onChange={(event) => { setPage(event.target.value as BackupPage); setVersions([]); setError(''); }} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2">
          {BACKUP_PAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      {cloudEnabled && <button type="button" disabled={busy} onClick={() => void run(async () => { await createBackupVersion(page); await load(); setMessage('已保存当前页面版本。'); })} className="rounded-lg bg-[#4285F4] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">立即备份此页面</button>}
      <button type="button" disabled={busy} onClick={() => void run(async () => {
        const current: Record<string, string> = {};
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key && isBackupableLegacyKey(key)) {
            const value = localStorage.getItem(key);
            if (value !== null) current[key] = value;
          }
        }
        await saveLocalBackup(localOwner, page, localPageValues(current, page));
        await load(); setMessage('已保存当前设备的页面版本。');
      })} className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm disabled:opacity-50">保存本地版本</button>
      <button type="button" disabled={busy} onClick={() => void load()} className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm disabled:opacity-50">刷新</button>
    </div>
    {cloudEnabled && (versions.length ? <div className="max-h-80 divide-y divide-[var(--card-border)] overflow-y-auto rounded-xl border border-[var(--card-border)]">
      {versions.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
        <span className="min-w-0 flex-1">{new Date(item.created_at).toLocaleString()} · {REASONS[item.reason]}{item.retention_exempt ? ' · 保留的故障前历史' : ''}</span>
        <button type="button" disabled={busy} onClick={() => void inspect(item.id)} className="text-[var(--brand)] disabled:opacity-50">查看内容</button>
        <button type="button" disabled={busy} onClick={() => void download(item.id)} className="text-[var(--brand)] disabled:opacity-50">下载到本地</button>
        <button type="button" disabled={busy} onClick={() => void restore(item.id)} className="text-[var(--brand)] disabled:opacity-50">恢复此页面</button>
        {preview?.id === item.id && <p className="w-full text-xs text-[var(--muted-foreground)]">{preview.details.join(' · ')}</p>}
      </div>)}
    </div> : <p className="text-sm text-[var(--muted-foreground)]">此页面暂无云端备份版本。</p>)}
    <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">此设备的本地版本</h3><label className="cursor-pointer text-sm text-[var(--brand)]">上传编辑后的页面 JSON<input type="file" accept="application/json,.json" className="hidden" onChange={(event) => { void uploadLocal(event.target.files?.[0]); event.target.value = ''; }} /></label></div>
      {localVersions.length ? <div className="max-h-60 divide-y divide-[var(--card-border)] overflow-y-auto rounded-xl border border-[var(--card-border)]">{localVersions.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"><span className="min-w-0 flex-1">{new Date(item.createdAt).toLocaleString()} · {Object.keys(item.values).length} 项{scheduleSummary(item.values[SCHEDULE_STORAGE_KEY]) ? ` · ${scheduleSummary(item.values[SCHEDULE_STORAGE_KEY])}` : ''}</span><details className="w-full text-xs text-[var(--muted-foreground)]"><summary className="cursor-pointer">查看包含的数据键</summary>{Object.keys(item.values).join('、')}</details><button type="button" disabled={busy} onClick={() => downloadLocal(item)} className="text-[var(--brand)] disabled:opacity-50">下载</button><button type="button" disabled={busy} onClick={() => void restoreLocal(item)} className="text-[var(--brand)] disabled:opacity-50">恢复到此设备</button></div>)}</div> : <p className="text-sm text-[var(--muted-foreground)]">此设备暂无该页面的本地版本。</p>}</div>
    {error && <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
    {message && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700">{message}</p>}
  </div>;
}
