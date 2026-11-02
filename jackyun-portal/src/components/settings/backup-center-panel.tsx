'use client';
import { captureRepositoryContext, workspaceStorage } from '@/lib/sync/repository';


import { siteConfirm } from '@/lib/site-dialog';
import { useCallback, useEffect, useState } from 'react';
import { uploadLocalPageBackup, downloadBackupVersionAsLocalShare, listBackupVersions, type BackupVersion } from '@/actions/backup-center';
import { BACKUP_PAGES, isBackupableLegacyKey, type BackupPage } from '@/lib/backup/pages';
import { CLOUD_STATE_APPLIED_EVENT } from '@/lib/local-workspace';
import { getSetting, getSyncArchiveData, queueV5RestoreTargets, restoreSyncArchiveData } from '@/lib/sync/outbox';
import { listLocalBackups, localPageValues, saveLocalBackup, type LocalBackup } from '@/lib/backup/local';
import { SCHEDULE_STORAGE_KEY } from '@/lib/sync/schedule-safety';
import { inspectScheduleVersion, type BackupInspection } from '@/lib/backup/inspection';
import { QUESTION_BANK_KEY } from '@/lib/learning/question-bank';
import { applyLocalPageImport, localPageReplacementDeletes, parseLocalPageBackup } from '@/lib/backup/local-import';
import { applyV5WorkspaceArchive, createV5WorkspaceArchiveFromSources, parseV5WorkspaceArchive } from '@/lib/backup/workspace-archive';
import { exportOfflineWorkspaceArchiveData, restoreOfflineWorkspaceArchiveData } from '@/lib/offline/workspace';
import { latestDataChange, type LocalShareBundle } from '@/lib/backup/local-share';
import ScheduleDataBlocksPanel from './schedule-data-blocks-panel';

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

function InspectionPanel({ title, value }: { title: string; value: BackupInspection }) {
  return <section className="space-y-3 rounded-xl border border-[var(--brand)]/40 bg-[var(--card)] p-4 text-sm" aria-label="备份版本对比">
    <h3 className="font-semibold">{title}</h3>
    <div className="flex flex-wrap gap-2">{value.facts.map((fact) => <span key={fact} className="rounded-lg bg-black/[.04] px-3 py-2 font-medium dark:bg-white/[.07]">{fact}</span>)}</div>
    {value.comparison.length > 0 && <div className="space-y-1"><p className="font-medium">与当前数据相比</p>{value.comparison.map((line) => <p key={line} className="leading-6 text-[var(--muted-foreground)]">{line}</p>)}</div>}
    {value.warning && <p className="text-amber-700 dark:text-amber-300">{value.warning}</p>}
  </section>;
}

export default function BackupCenterPanel({ userId, cloudEnabled = true }: { userId: string; cloudEnabled?: boolean }) {
  const [page, setPage] = useState<BackupPage>('schedule');
  const [versions, setVersions] = useState<BackupVersion[]>([]);
  const [localOwner, setLocalOwner] = useState(userId);
  const [localVersions, setLocalVersions] = useState<LocalBackup[]>([]);
  const [preview, setPreview] = useState<{ id: number; source: 'local'; inspection: BackupInspection } | null>(null);
  const [cloudPreview,setCloudPreview]=useState<{id:number;bundle:LocalShareBundle}|null>(null);
  const [cloudListOpen,setCloudListOpen]=useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const owner = userId === 'guest' ? await getSetting<string>('activeUserId').catch(() => null) ?? 'guest' : userId;
    setLocalOwner(owner);
    const local = await Promise.allSettled([listLocalBackups(owner,page)]).then(results=>results[0]);
    if (local.status === 'fulfilled') setLocalVersions(local.value);
    const failure = [local].find((result) => result.status === 'rejected');
    setError(failure?.status === 'rejected' ? String(failure.reason instanceof Error ? failure.reason.message : failure.reason) : '');
  }, [page, userId]);

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
      const bundle = cloudPreview?.id===id?cloudPreview.bundle:await downloadBackupVersionAsLocalShare(id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `jackyun-local-share-cloud-${page}-${id}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  async function inspectCloud(id:number){
    await run(async()=>{const bundle=await downloadBackupVersionAsLocalShare(id);setCloudPreview({id,bundle});setMessage('已读取所选服务器备份用于本机对比；没有写入本机。');});
  }

  async function openCloudList(){
    if(!cloudEnabled)return;
    await run(async()=>{setVersions(await listBackupVersions(page));setCloudListOpen(true);setCloudPreview(null);setMessage('服务器备份列表已按需读取；页面内容仍未下载或修改。');});
  }

  async function replaceFromCloud(){
    if(!cloudPreview)return;
    const remote=cloudPreview.bundle.pages.find(item=>item.page===page);
    if(!remote){setError('服务器备份页面与当前选择不一致。');return;}
    const current=localPageValues(workspaceStorage.snapshot(),page);
    const deletedKeys=localPageReplacementDeletes(page,current,remote.values);
    const localChangedAt=latestDataChange(current);
    const same=JSON.stringify(Object.entries(current).sort(([a],[b])=>a.localeCompare(b)))===JSON.stringify(Object.entries(remote.values).sort(([a],[b])=>a.localeCompare(b)));
    const recency=remote.dataChangedAt&&localChangedAt
      ?remote.dataChangedAt===localChangedAt?'两边记录时间相同':remote.dataChangedAt>localChangedAt?'云端记录时间较新':'本机记录时间较新'
      :'记录正文没有可比较的完整修改时间';
    const label=BACKUP_PAGES.find(item=>item.id===page)?.label??page;
    if(!(await siteConfirm(`将服务器备份 #${cloudPreview.id} 的“${label}”整体替换本机此页面？${same?'云端与本机数据相同。':'云端与本机数据有差异。'}${recency}。本机缺少的 ${deletedKeys.length} 项会被删除；导入前会先保存本机恢复点。其他页面不受影响。`)))return;
    await run(async()=>{
      const repository=await captureRepositoryContext();
      if(repository.owner!==(localOwner==='guest'?null:localOwner))throw Error('本机账号已变化，云端备份尚未写入。');
      const currentSnapshot=workspaceStorage.snapshot(),current=localPageValues(currentSnapshot,page);
      const removed=localPageReplacementDeletes(page,current,remote.values);
      const keys=await applyLocalPageImport({page,owner:localOwner,values:remote.values,deletedKeys:removed,expectedCurrent:current,storage:{
        keys:()=>Object.keys(workspaceStorage.snapshot()),getItem:key=>workspaceStorage.getItem(key),
        setItem:(key,value)=>workspaceStorage.setItem(key,value),removeItem:key=>workspaceStorage.removeItem(key),flush:()=>workspaceStorage.flush(),
      },saveRecoveryPoint:saveLocalBackup});
      repository.assertCurrent();
      if(keys.length)window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT,{detail:{keys,source:'manual-cloud-backup-import'}}));
      setMessage(`已将服务器备份 #${cloudPreview.id} 的“${label}”替换到本机，并保存了替换前恢复点。`);
      setCloudPreview(null);await load();
    });
  }

  function inspectLocal(item: LocalBackup) {
    const current = workspaceStorage.getItem(SCHEDULE_STORAGE_KEY);
    const inspection = page === 'schedule'
      ? inspectScheduleVersion(item.values[SCHEDULE_STORAGE_KEY], current, item.values[QUESTION_BANK_KEY], workspaceStorage.getItem(QUESTION_BANK_KEY))
      : { facts: [`此设备保存了 ${Object.keys(item.values).length} 份页面数据`], comparison: [], warning: '此页面暂无逐条对比；可先下载文件检查。' };
    setPreview({ id: item.id, source: 'local', inspection });
  }

  async function applyLocal(item: LocalBackup) {
    const keys = await applyLocalPageImport({
      page: item.page,
      owner: localOwner,
      values: item.values,
      deletedKeys: item.deletedKeys,
      storage: {
        keys: () => Array.from({ length: workspaceStorage.length }, (_, index) => workspaceStorage.key(index)).filter((key): key is string => key !== null),
        getItem: key => workspaceStorage.getItem(key),
        setItem: (key, value) => workspaceStorage.setItem(key, value),
        removeItem: key => workspaceStorage.removeItem(key),
        flush: () => workspaceStorage.flush(),
      },
      saveRecoveryPoint: saveLocalBackup,
      queueV5Targets: queueV5RestoreTargets,
    });
    window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT, { detail: { keys } }));
    window.dispatchEvent(new Event('jackyun-sync-retry'));
    setMessage('本地页面已恢复到所选版本，原状态已先保存。');
    await load();
  }

  async function restoreLocal(item: LocalBackup) {
    if (!(await siteConfirm('把这个浏览器中的页面版本恢复到当前设备？当前本地页面会先保存，数据只会写入此设备。'))) return;
    await run(() => applyLocal(item));
  }

  function downloadLocal(item: LocalBackup) {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, page: item.page, createdAt: item.createdAt, values: item.values, deletedKeys: item.deletedKeys ?? [] }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `jackyun-local-${item.page}-${item.id}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportAllLocalData() {
    await run(async () => {
      const repository = await captureRepositoryContext();
      if (repository.owner !== (localOwner === 'guest' ? null : localOwner)) throw new Error('本机账号已变化，请刷新备份中心后重试。');
      const archive = await createV5WorkspaceArchiveFromSources({
        assertContextCurrent: repository.assertCurrent,
        readOfflineWorkspace: () => exportOfflineWorkspaceArchiveData(localOwner),
        readSyncState: () => getSyncArchiveData(localOwner),
        readWorkspace: () => workspaceStorage.snapshot(),
      });
      const url = URL.createObjectURL(new Blob([JSON.stringify(archive)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `jackyun-v5-local-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const offlineWorkspace = archive.offlineWorkspace!;
      const syncState = archive.syncState!;
      setMessage(`已导出 ${archive.recordCount} 条工作区记录、${offlineWorkspace.snapshots.length} 个离线快照、${offlineWorkspace.outbox.length} 个离线操作，以及 ${syncState.legacyOutbox.length + syncState.v5Outbox.length} 个同步待办、${syncState.legacyConflicts.length + syncState.v5Conflicts.length} 个冲突；未下载的云端数据不在此文件内。`);
    });
  }

  async function importAllLocalData(file?: File) {
    if (!file) return;
    await run(async () => {
      const archive = await parseV5WorkspaceArchive(await file.text());
      const repository = await captureRepositoryContext();
      if (repository.owner !== (localOwner === 'guest' ? null : localOwner)) throw new Error('本机账号已变化，请刷新备份中心后重试。');
      const pending = archive.syncState ? archive.syncState.legacyOutbox.length + archive.syncState.v5Outbox.length : 0;
      const conflicts = archive.syncState ? archive.syncState.legacyConflicts.length + archive.syncState.v5Conflicts.length : 0;
      if (!(await siteConfirm(`完整性校验通过，共 ${archive.recordCount} 条工作区记录、${pending} 个待同步操作和 ${conflicts} 个冲突。合并到当前账号？导入会先保存恢复点，不会因归档缺少某键而删除本机数据。`))) return;
      repository.assertCurrent();
      const keys = await applyV5WorkspaceArchive({
        archive,
        owner: localOwner,
        storage: {
          keys: () => { repository.assertCurrent(); return Object.keys(workspaceStorage.snapshot()); },
          getItem: key => { repository.assertCurrent(); return workspaceStorage.getItem(key); },
          setItem: (key, value) => { repository.assertCurrent(); workspaceStorage.setItem(key, value); },
          removeItem: key => { repository.assertCurrent(); workspaceStorage.removeItem(key); },
          flush: async () => { await workspaceStorage.flush(); repository.assertCurrent(); },
        },
        saveRecoveryPoint: saveLocalBackup,
        queueV5Targets: targets => queueV5RestoreTargets(targets, repository.databaseScope),
        restoreOfflineWorkspace: restoreOfflineWorkspaceArchiveData,
        restoreSyncState: restoreSyncArchiveData,
        assertContextCurrent: repository.assertCurrent,
      });
      repository.assertCurrent();
      if (keys.length) window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT, { detail: { keys } }));
      if (keys.length || archive.offlineWorkspace || archive.syncState) {
        window.dispatchEvent(new Event('jackyun-sync-retry'));
      }
      const offlineCount = archive.offlineWorkspace ? `；归档含 ${archive.offlineWorkspace.snapshots.length} 个离线快照和 ${archive.offlineWorkspace.outbox.length} 个离线操作（已存在的快照保留，操作按 ID 合并）` : '';
      const syncCount = archive.syncState ? `；同步待办 ${archive.syncState.legacyOutbox.length + archive.syncState.v5Outbox.length} 个、冲突 ${archive.syncState.legacyConflicts.length + archive.syncState.v5Conflicts.length} 个（按操作 ID 合并并先保存恢复点）` : '';
      setMessage(keys.length || archive.offlineWorkspace || archive.syncState ? `已将 ${keys.length} 条工作区变更保存到本机${offlineCount}${syncCount}；v5 云端核对将在后台继续。` : '文件与本机内容相同，无需恢复。');
      await load();
    });
  }

  async function uploadLocal(file?: File) {
    if (!file) return;
    await run(async () => {
      const backup = parseLocalPageBackup(await file.text(), page);
      if (!(await siteConfirm('导入编辑后的页面 JSON？当前本地页面会先保存。'))) return;
      await applyLocal({ id: -1, userId: localOwner, page, createdAt: new Date().toISOString(), ...backup });
    });
  }

  const currentPageValues=localPageValues(workspaceStorage.snapshot(),page);
  const currentPageChangedAt=latestDataChange(currentPageValues);
  const selectedCloudPage=cloudPreview?.bundle.pages.find(item=>item.page===page);
  const cloudScheduleInspection = page === 'schedule' && selectedCloudPage
    ? inspectScheduleVersion(selectedCloudPage.values[SCHEDULE_STORAGE_KEY], workspaceStorage.getItem(SCHEDULE_STORAGE_KEY), selectedCloudPage.values[QUESTION_BANK_KEY], workspaceStorage.getItem(QUESTION_BANK_KEY))
    : null;
  const cloudMatchesLocal=selectedCloudPage&&JSON.stringify(Object.entries(currentPageValues).sort(([a],[b])=>a.localeCompare(b)))===JSON.stringify(Object.entries(selectedCloudPage.values).sort(([a],[b])=>a.localeCompare(b)));

  return <div className="space-y-4">
    {page === 'schedule' && <ScheduleDataBlocksPanel owner={localOwner} />}
    <p className="text-sm leading-6 text-[var(--muted-foreground)]">页面数据有修改后最多 30 秒自动保存一次本地恢复点，每页保留最近五个版本。登录后可手动把当前页面上传为服务器备份；服务器备份不会自动下载到本机。</p>
    <p className="text-sm leading-6 text-[var(--muted-foreground)]">本机归档包含工作区记录、离线任务队列、同步 outbox 与冲突，并按当前账号隔离。导入会合并未确认操作，不覆盖本机已有修改；云端专属且未下载的数据不在本机归档内。</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm">页面
        <select value={page} onChange={(event) => { setPage(event.target.value as BackupPage); setVersions([]); setPreview(null); setCloudPreview(null); setCloudListOpen(false); setError(''); }} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2">
          {BACKUP_PAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      {cloudEnabled && <button type="button" disabled={busy} onClick={() => void run(async () => { const values=localPageValues(workspaceStorage.snapshot(),page); if(!(await siteConfirm(`把“${BACKUP_PAGES.find(item=>item.id===page)?.label??page}”的 ${Object.keys(values).length} 项本地数据上传到服务器，保存为备份？此操作不会改动本机或触发下载。`)))return; await uploadLocalPageBackup(page,values); await load(); setMessage('当前本地页面已上传为服务器备份；本机数据未改动。'); })} className="rounded-lg bg-[#4285F4] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">上传本地页面到服务器备份</button>}
      <button type="button" disabled={busy} onClick={() => void exportAllLocalData()} className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm disabled:opacity-50">导出本机数据与待同步队列</button>
      <label className={`cursor-pointer rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm ${busy ? 'pointer-events-none opacity-50' : ''}`}>导入本机恢复归档<input type="file" accept="application/json,.json" disabled={busy} className="hidden" onChange={(event) => { void importAllLocalData(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <button type="button" disabled={busy} onClick={() => void run(async () => {
        const current: Record<string, string> = {};
        for (let index = 0; index < workspaceStorage.length; index += 1) {
          const key = workspaceStorage.key(index);
          if (key && isBackupableLegacyKey(key)) {
            const value = workspaceStorage.getItem(key);
            if (value !== null) current[key] = value;
          }
        }
        await saveLocalBackup(localOwner, page, localPageValues(current, page));
        await load(); setMessage('已保存当前设备的页面版本。');
      })} className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm disabled:opacity-50">保存本地版本</button>
      <button type="button" disabled={busy} onClick={() => void load()} className="rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm disabled:opacity-50">刷新</button>
    </div>
    {cloudEnabled&&<section className="space-y-3 rounded-xl border border-[var(--card-border)] p-4"><div className="flex flex-wrap items-center gap-3"><div className="mr-auto"><h3 className="text-sm font-semibold">服务器页面备份</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">只在点击后查看。可以比较内容、下载 JSON，或确认后整体替换本机所选页面。</p></div><button type="button" disabled={busy} onClick={()=>void openCloudList()} className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm disabled:opacity-50">{cloudListOpen?'刷新服务器备份':'查看服务器备份'}</button></div>
      {cloudListOpen&&(versions.length?<div className="max-h-80 divide-y divide-[var(--card-border)] overflow-y-auto rounded-xl border border-[var(--card-border)]">
        {versions.map((item,index)=><div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"><span className="min-w-0 flex-1"><strong>备份 #{item.id}</strong><span className="ml-2 text-xs text-[var(--muted-foreground)]">备份时间 {new Date(item.created_at).toLocaleString()} · {REASONS[item.reason]}{index===0?' · 最新备份':''}{item.retention_exempt?' · 保留历史':''}</span></span><button type="button" disabled={busy} onClick={()=>void inspectCloud(item.id)} className="text-[var(--brand)] disabled:opacity-50">查看内容</button><button type="button" disabled={busy} onClick={()=>void download(item.id)} className="text-[var(--brand)] disabled:opacity-50">下载 JSON</button></div>)}
      </div>:<p className="text-sm text-[var(--muted-foreground)]">此页面暂无服务器备份版本。</p>)}
      {selectedCloudPage&&<div className="space-y-2 rounded-lg bg-[var(--background)] p-3 text-sm"><strong>服务器备份 #{cloudPreview!.id} · {selectedCloudPage.label}</strong><p>云端数据最后修改：{selectedCloudPage.dataChangedAt?new Date(selectedCloudPage.dataChangedAt).toLocaleString():'记录未提供修改时间'} · {Object.keys(selectedCloudPage.values).length} 项</p><p>本机数据最后修改：{currentPageChangedAt?new Date(currentPageChangedAt).toLocaleString():'记录未提供修改时间'} · {Object.keys(currentPageValues).length} 项</p><p>{cloudMatchesLocal?'云端与本机内容相同。':'云端与本机内容有差异；数据时间仅按记录正文中的时间字段比较。'}</p>{cloudScheduleInspection&&<InspectionPanel title="Schedule 数据块、学习进度与未完成草稿对比" value={cloudScheduleInspection} />}<button type="button" disabled={busy} onClick={()=>void replaceFromCloud()} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">确认后整体替换本机此页</button></div>}
    </section>}
    <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">此设备的本地版本</h3><label className="cursor-pointer text-sm text-[var(--brand)]">上传编辑后的页面 JSON<input type="file" accept="application/json,.json" className="hidden" onChange={(event) => { void uploadLocal(event.target.files?.[0]); event.target.value = ''; }} /></label></div>
      {localVersions.length ? <div className="max-h-60 divide-y divide-[var(--card-border)] overflow-y-auto rounded-xl border border-[var(--card-border)]">{localVersions.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"><span className="min-w-0 flex-1"><strong>{new Date(item.createdAt).toLocaleString()}</strong>{scheduleSummary(item.values[SCHEDULE_STORAGE_KEY]) ? ` · ${scheduleSummary(item.values[SCHEDULE_STORAGE_KEY])}` : ` · ${Object.keys(item.values).length} 份数据`}</span><button type="button" disabled={busy} onClick={() => inspectLocal(item)} className="font-medium text-[var(--brand)] disabled:opacity-50">对比当前设备</button><button type="button" disabled={busy} onClick={() => downloadLocal(item)} className="text-[var(--brand)] disabled:opacity-50">下载</button><button type="button" disabled={busy} onClick={() => void restoreLocal(item)} className="text-[var(--brand)] disabled:opacity-50">恢复</button></div>)}</div> : <p className="text-sm text-[var(--muted-foreground)]">此设备暂无该页面的本地版本。</p>}</div>
    {preview?.source === 'local' && <InspectionPanel title={`本地版本 #${preview.id} · 与此设备当前数据比较`} value={preview.inspection} />}
    {error && <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
    {message && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700">{message}</p>}
  </div>;
}
