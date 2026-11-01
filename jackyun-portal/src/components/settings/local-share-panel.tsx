'use client';

import {useMemo,useState} from 'react';
import {siteConfirm} from '@/lib/site-dialog';
import {workspaceStorage,captureRepositoryContext} from '@/lib/sync/repository';
import {getSetting} from '@/lib/sync/outbox';
import {BACKUP_PAGES,type BackupPage} from '@/lib/backup/pages';
import {applyLocalPageImport,localPageReplacementDeletes,parseLocalPageBackup} from '@/lib/backup/local-import';
import {localPageValues,saveLocalBackup} from '@/lib/backup/local';
import {createLocalShare,parseLocalShare,type LocalShareBundle} from '@/lib/backup/local-share';
import {CLOUD_STATE_APPLIED_EVENT} from '@/lib/local-workspace';

const stableValues=(values:Record<string,string>)=>JSON.stringify(Object.entries(values).sort(([a],[b])=>a.localeCompare(b)));

export default function LocalSharePanel({userId}:{userId:string}){
  const [selected,setSelected]=useState<BackupPage[]>(['schedule']);
  const [incoming,setIncoming]=useState<LocalShareBundle|null>(null);
  const [incomingPages,setIncomingPages]=useState<BackupPage[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const labels=useMemo(()=>new Map(BACKUP_PAGES.map(row=>[row.id,row.label])),[]);
  const toggle=(page:BackupPage)=>setSelected(current=>current.includes(page)?current.filter(value=>value!==page):[...current,page]);

  async function exportPages(){
    if(!selected.length){setError('请至少选择一个页面。');return;}
    setBusy(true);setError('');setMessage('');
    try{
      const repository=await captureRepositoryContext();
      const active=await getSetting<string>('activeUserId');
      if(repository.owner!==(userId==='guest'?active??null:userId))throw Error('账号已变化，请刷新设置页面后重试。');
      const snapshot=workspaceStorage.snapshot();repository.assertCurrent();
      const bundle=createLocalShare(snapshot,selected);
      const blob=new Blob([JSON.stringify(bundle)],{type:'application/json'});
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;
      link.download=`jackyun-local-share-${selected.length===1?selected[0]:'pages'}-${new Date().toISOString().slice(0,10)}.json`;
      link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setMessage(`已导出 ${bundle.pages.length} 个页面，共 ${bundle.pages.reduce((n,page)=>n+Object.keys(page.values).length,0)} 项数据。文件中的“数据最后修改”来自页面记录本身，不使用导出或导入时间。`);
    }catch(cause){setError(cause instanceof Error?cause.message:'本地导出失败。');}finally{setBusy(false);}
  }

  async function chooseFile(file?:File){
    if(!file)return;setBusy(true);setError('');setMessage('');
    try{
      const bundle=parseLocalShare(await file.text());
      for(const page of bundle.pages)if(Object.keys(page.values).length)parseLocalPageBackup(JSON.stringify({version:2,page:page.page,values:page.values,deletedKeys:[]}),page.page);
      setIncoming(bundle);setIncomingPages(bundle.pages.map(page=>page.page));
      setMessage(`文件已验证：${bundle.pages.length} 个页面、${bundle.pages.reduce((n,page)=>n+Object.keys(page.values).length,0)} 项数据。选择要导入的页面。`);
    }catch(cause){setIncoming(null);setIncomingPages([]);setError(cause instanceof Error?cause.message:'无法读取本地分享文件。');}finally{setBusy(false);}
  }

  async function importPages(){
    if(!incoming||!incomingPages.length)return;
    const pages=incoming.pages.filter(page=>incomingPages.includes(page.page));
    if(!pages.length){setError('所选页面没有可导入的数据。');return;}
    const current=workspaceStorage.snapshot();
    const overlaps=pages.reduce((total,page)=>total+Object.keys(page.values).filter(key=>current[key]!==undefined).length,0);
    const deletes=pages.reduce((total,page)=>total+localPageReplacementDeletes(page.page,current,page.values).length,0);
    const summary=pages.map(page=>`${page.label}（文件 ${Object.keys(page.values).length} 项${page.dataChangedAt?`，数据时间 ${new Date(page.dataChangedAt).toLocaleString()}`:'，数据未记录修改时间'}）`).join('、');
    if(!(await siteConfirm(`整体替换所选页面：${summary}。本机将替换 ${overlaps} 项同名数据，并删除文件未包含的 ${deletes} 项所选页面数据。每个页面会先保存本机恢复点；未选择的页面不受影响。`)))return;
    setBusy(true);setError('');setMessage('');
    try{
      const repository=await captureRepositoryContext();
      const active=await getSetting<string>('activeUserId');
      if(repository.owner!==(userId==='guest'?active??null:userId))throw Error('账号已变化，导入已停止。');
      const owner=userId==='guest'?active??'guest':userId;
      const before=workspaceStorage.snapshot();
      if(pages.some(page=>stableValues(localPageValues(before,page.page))!==stableValues(localPageValues(workspaceStorage.snapshot(),page.page))))throw Error('确认期间本机页面又发生了修改；尚未导入，请重新选择文件并确认。');
      for(const page of pages){repository.assertCurrent();await saveLocalBackup(owner,page.page,localPageValues(before,page.page));}
      const changed:string[]=[];
      for(const page of pages){
        repository.assertCurrent();
        const deletedKeys=localPageReplacementDeletes(page.page,before,page.values);
        const keys=await applyLocalPageImport({page:page.page,owner,values:page.values,deletedKeys,expectedCurrent:localPageValues(before,page.page),storage:{
          keys:()=>Object.keys(workspaceStorage.snapshot()),getItem:key=>workspaceStorage.getItem(key),
          setItem:(key,value)=>workspaceStorage.setItem(key,value),removeItem:key=>workspaceStorage.removeItem(key),flush:()=>workspaceStorage.flush(),
        },saveRecoveryPoint:async()=>{}});
        changed.push(...keys);
      }
      repository.assertCurrent();
      if(changed.length)window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT,{detail:{keys:changed,source:'local-share-import'}}));
      setIncoming(null);setIncomingPages([]);setMessage(`已导入 ${pages.length} 个页面；数据时间沿用分享文件记录，导入时间不会覆盖它。`);
    }catch(cause){setError(cause instanceof Error?cause.message:'导入失败；本机恢复点已保留。');}finally{setBusy(false);}
  }

  return <div className="space-y-5">
    <p className="text-sm leading-6 text-[var(--muted-foreground)]">本地分享只在当前设备生成 JSON 文件。可用电脑导出 Schedule，再把文件传到手机导入。确认后，所选页面按文件整体替换；未选择的页面保持不变，替换前会保存本机恢复点。</p>
    <section className="space-y-3 rounded-xl border border-[var(--card-border)] p-4" aria-label="选择本地导出页面">
      <div className="flex flex-wrap items-center gap-3"><h3 className="mr-auto font-semibold">导出页面</h3><button type="button" className="text-sm text-[var(--brand)]" onClick={()=>setSelected(BACKUP_PAGES.map(page=>page.id))}>全选</button><button type="button" className="text-sm text-[var(--muted-foreground)]" onClick={()=>setSelected([])}>全不选</button></div>
      <div className="grid gap-2 sm:grid-cols-2">{BACKUP_PAGES.map(page=><label key={page.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--background)] px-3 py-2 text-sm"><input type="checkbox" checked={selected.includes(page.id)} onChange={()=>toggle(page.id)}/><span>{page.label}</span></label>)}</div>
      <button type="button" disabled={busy||!selected.length} onClick={()=>void exportPages()} className="rounded-lg bg-[#1a73e8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?'处理中…':`导出 ${selected.length} 个页面 JSON`}</button>
    </section>
    <section className="space-y-3 rounded-xl border border-[var(--card-border)] p-4" aria-label="导入本地分享文件">
      <div><h3 className="font-semibold">导入其他设备的页面</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">选择 JSON 后可全选或逐页导入。确认后所选页面整体替换；替换前会保存本机恢复点。</p></div>
      <label className="inline-flex cursor-pointer items-center rounded-lg border border-[var(--card-border)] px-4 py-2 text-sm font-medium">选择 JSON 文件<input type="file" accept="application/json,.json" className="hidden" disabled={busy} onChange={event=>{void chooseFile(event.target.files?.[0]);event.target.value='';}}/></label>
      {incoming&&<div className="space-y-2 rounded-lg bg-[var(--background)] p-3"><div className="flex flex-wrap items-center gap-3"><strong className="mr-auto text-sm">分享文件中的页面</strong><button type="button" className="text-sm text-[var(--brand)]" onClick={()=>setIncomingPages(incoming.pages.map(page=>page.page))}>全选</button><button type="button" className="text-sm" onClick={()=>setIncomingPages([])}>全不选</button></div>{incoming.pages.map(page=><label key={page.page} className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" checked={incomingPages.includes(page.page)} onChange={()=>setIncomingPages(current=>current.includes(page.page)?current.filter(value=>value!==page.page):[...current,page.page])}/><span className="flex-1">{labels.get(page.page)} · {Object.keys(page.values).length} 项 · 数据最后修改：{page.dataChangedAt?new Date(page.dataChangedAt).toLocaleString():'未记录'}</span></label>)}<button type="button" disabled={busy||!incomingPages.length} onClick={()=>void importPages()} className="rounded-lg bg-[#34a853] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?'处理中…':`导入 ${incomingPages.length} 个页面`}</button></div>}
    </section>
    {message&&<p role="status" className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700">{message}</p>}
    {error&&<p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{error}</p>}
  </div>;
}
