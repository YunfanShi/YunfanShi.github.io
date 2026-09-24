'use client';

import { useCallback, useEffect, useState } from 'react';
import { createBackupVersion, downloadBackupVersion, getBackupPreferences, listBackupVersions, restoreBackupVersion, setBackupPreferences, type BackupVersion } from '@/actions/backup-center';
import { BACKUP_PAGES, isBackupableLegacyKey, legacyBackupPage, type BackupPage } from '@/lib/backup/pages';
import { CLOUD_STATE_APPLIED_EVENT, storageValueToString } from '@/lib/local-workspace';
import { getOutbox, removeOperation, saveMetadata } from '@/lib/sync/outbox';
import { getLocalBackupLimit, listLocalBackups, localPageValues, pruneLocalBackups, saveLocalBackup, setLocalBackupLimit, type LocalBackup } from '@/lib/backup/local';
import { scheduleHasContent, SCHEDULE_STORAGE_KEY } from '@/lib/sync/schedule-safety';

const REASONS: Record<BackupVersion['reason'], string> = {
  automatic: '自动', baseline: '初始', before_restore: '恢复前', manual: '手动',
};

export default function BackupCenterPanel({ userId, cloudEnabled = true }: { userId: string; cloudEnabled?: boolean }) {
  const [page, setPage] = useState<BackupPage>('schedule');
  const [versions, setVersions] = useState<BackupVersion[]>([]);
  const [limit, setLimit] = useState<20 | 50 | 100>(50);
  const [localVersions, setLocalVersions] = useState<LocalBackup[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      if (cloudEnabled) setVersions(await listBackupVersions(page));
      setLocalVersions(await listLocalBackups(userId, page));
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : '读取备份失败。'); }
  }, [page, userId, cloudEnabled]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (cloudEnabled) void getBackupPreferences().then(async (value) => {
        setLimit(value);
        setLocalBackupLimit(value);
        await pruneLocalBackups(userId);
        await load();
      }).catch((cause) => setError(cause instanceof Error ? cause.message : '读取备份设置失败。'));
      else setLimit(getLocalBackupLimit());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cloudEnabled, userId, load]);

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
    await saveLocalBackup(userId, item.page, localPageValues(current, item.page));
    for (const [key, value] of Object.entries(item.values)) {
      if (!isBackupableLegacyKey(key) || legacyBackupPage(key) !== item.page) throw new Error('本地备份包含不允许恢复的键。');
      localStorage.setItem(key, value);
    }
    window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT, { detail: { keys: Object.keys(item.values) } }));
    window.dispatchEvent(new Event('jackyun-sync-retry'));
    setMessage('本地页面已恢复，原状态已先保存；联网后会按现有同步规则处理。');
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
      await applyLocal({ id: -1, userId, page, createdAt: new Date().toISOString(), values: parsed.values });
    });
  }

  return <div className="space-y-4">
    <p className="text-sm leading-6 text-[var(--muted-foreground)]">{cloudEnabled ? '云端数据每次写入前自动保存所属页面的版本；本地页面变化也会自动留存。每个页面分别保留最近的版本，超过上限时删除最旧版本。恢复会先保存当前页面，并把备份中的记录合并回来。' : '本地页面变化会自动留存于此设备。每个页面保留最近的版本，超过上限时删除最旧版本。'}</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">页面
        <select value={page} onChange={(event) => { setPage(event.target.value as BackupPage); setVersions([]); setError(''); }} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2">
          {BACKUP_PAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">每页最多保留
        <select value={limit} disabled={busy} onChange={(event) => {
          const value = Number(event.target.value) as 20 | 50 | 100;
          void run(async () => { if (cloudEnabled) await setBackupPreferences(value); setLocalBackupLimit(value); await pruneLocalBackups(userId); setLimit(value); await load(); setMessage(`每个页面最多保留 ${value} 个${cloudEnabled ? '本地和云端' : '本地'}版本。`); });
        }} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2">
          {[20, 50, 100].map((value) => <option key={value} value={value}>{value} 个版本</option>)}
        </select>
      </label>
      {cloudEnabled && <button type="button" disabled={busy} onClick={() => void run(async () => { await createBackupVersion(page); await load(); setMessage('已保存当前页面版本。'); })} className="rounded-lg bg-[#4285F4] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">立即备份此页面</button>}
      <button type="button" disabled={busy} onClick={() => void load()} className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm disabled:opacity-50">刷新</button>
    </div>
    {cloudEnabled && (versions.length ? <div className="max-h-80 divide-y divide-[var(--card-border)] overflow-y-auto rounded-xl border border-[var(--card-border)]">
      {versions.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
        <span className="min-w-0 flex-1">{new Date(item.created_at).toLocaleString()} · {REASONS[item.reason]}</span>
        <button type="button" disabled={busy} onClick={() => void download(item.id)} className="text-[var(--brand)] disabled:opacity-50">下载到本地</button>
        <button type="button" disabled={busy} onClick={() => void restore(item.id)} className="text-[var(--brand)] disabled:opacity-50">恢复此页面</button>
      </div>)}
    </div> : <p className="text-sm text-[var(--muted-foreground)]">此页面暂无云端备份版本。</p>)}
    <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">此设备的本地版本</h3><label className="cursor-pointer text-sm text-[var(--brand)]">上传编辑后的页面 JSON<input type="file" accept="application/json,.json" className="hidden" onChange={(event) => { void uploadLocal(event.target.files?.[0]); event.target.value = ''; }} /></label></div>
      {localVersions.length ? <div className="max-h-60 divide-y divide-[var(--card-border)] overflow-y-auto rounded-xl border border-[var(--card-border)]">{localVersions.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"><span className="min-w-0 flex-1">{new Date(item.createdAt).toLocaleString()} · {Object.keys(item.values).length} 项</span><button type="button" disabled={busy} onClick={() => downloadLocal(item)} className="text-[var(--brand)] disabled:opacity-50">下载</button><button type="button" disabled={busy} onClick={() => void restoreLocal(item)} className="text-[var(--brand)] disabled:opacity-50">恢复到此设备</button></div>)}</div> : <p className="text-sm text-[var(--muted-foreground)]">此设备暂无该页面的本地版本。</p>}</div>
    {error && <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
    {message && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700">{message}</p>}
  </div>;
}
