'use client';
import { siteConfirm } from '@/lib/site-dialog';
import { useEffect, useState } from 'react';
import { downloadScheduleBackup, listScheduleBackups, restoreScheduleBackup } from '@/actions/schedule-backups';
import { restoreRepositoryRecord } from '@/lib/sync/repository';
import { SCHEDULE_STORAGE_KEY } from '@/lib/sync/schedule-safety';

type Backup = Awaited<ReturnType<typeof listScheduleBackups>>[number];

export default function ScheduleBackupsPanel() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    try { setBackups(await listScheduleBackups()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取备份。'); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function download(id: number) {
    setBusy(true); setError('');
    try {
      const backup = await downloadScheduleBackup(id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `jackyun-schedule-${id}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '下载失败。'); }
    finally { setBusy(false); }
  }

  async function restore(id: number) {
    if (!(await siteConfirm('恢复这个 Schedule 版本？当前云端版本会先自动备份，然后替换为所选版本。尚未确认的 V5 本地修改会保留并合并。'))) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await restoreRepositoryRecord(SCHEDULE_STORAGE_KEY, async () => {
        const result = await restoreScheduleBackup(id);
        return { key: SCHEDULE_STORAGE_KEY, value: result.value, revision: Number(result.revision), contentHash: result.contentHash, deleted: false, updatedAt: result.updatedAt };
      });
      setNotice('Schedule 已恢复到当前页面；未确认的 V5 本地修改已保留。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '恢复失败。'); }
    finally { setBusy(false); }
  }

  return <div className="space-y-3">
    <p className="text-sm leading-6 text-[var(--muted-foreground)]">这里保留此前的 Schedule 专项历史。恢复时会先手动备份当前云端页面；新修改由本地备份中心自动保存。</p>
    <button type="button" disabled={busy} onClick={() => void load()} className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm disabled:opacity-50">刷新备份</button>
    {backups.length === 0 && !error ? <p className="text-sm text-[var(--muted-foreground)]">暂无可恢复的 Schedule 版本。</p> : null}
    {backups.length > 0 ? <div className="max-h-80 divide-y divide-[var(--card-border)] overflow-y-auto rounded-xl border border-[var(--card-border)]">{backups.map((backup) => <div key={backup.id} className="flex flex-wrap items-center gap-3 p-3 text-sm"><span className="min-w-0 flex-1">{new Date(backup.created_at).toLocaleString()} · 修订 {backup.revision}</span><button type="button" disabled={busy} onClick={() => void download(backup.id)} className="text-[var(--brand)] disabled:opacity-50">下载</button><button type="button" disabled={busy} onClick={() => void restore(backup.id)} className="text-[var(--brand)] disabled:opacity-50">恢复</button></div>)}</div> : null}
    {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
    {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
  </div>;
}
