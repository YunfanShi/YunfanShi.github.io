'use client';

import {useMemo,useState} from 'react';
import {siteConfirm} from '@/lib/site-dialog';
import {BACKUP_PAGES,legacyBackupPage} from '@/lib/backup/pages';
import {chooseComparisonValue,compareSyncValues,comparisonTextParts,conflictBase,defaultMerge,formatComparisonValue,parseMergeImport,readComparisonLocal,summarizeComparisonValue} from '@/lib/sync/comparison';
import type {SyncConflict,SyncResolutionChoice,SyncResolutionRequest} from '@/types/sync';

const button='rounded-lg border border-[var(--card-border)] px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';
function DifferenceValue({value,other}:{value:unknown;other:unknown}) {
  const text=typeof value==='string'&&typeof other==='string'?comparisonTextParts(value,other):null;
  return <div className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-sm leading-6">{text?<>{text.before}<mark className="rounded bg-amber-400/30 text-inherit">{text.change||'（此处没有文字）'}</mark>{text.after}</>:summarizeComparisonValue(value).slice(0,2000)}</div>;
}
function download(key:string,value:unknown,deleted:boolean,suffix:string) {
  const url=URL.createObjectURL(new Blob([JSON.stringify({format:'jackyun-sync-merge-v1',key,value:deleted?null:value,deleted},null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`${key}-${suffix}.json`;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function SyncConflictReview({conflict,localRaw,disabled,onSubmit}:{conflict:SyncConflict;localRaw:string|null;disabled:boolean;onSubmit:(request:SyncResolutionRequest)=>void}) {
  const local=useMemo(()=>readComparisonLocal(localRaw),[localRaw]);
  const remote=conflict.remoteDeleted?undefined:conflict.remoteValue;
  const comparison=useMemo(()=>compareSyncValues(conflictBase(conflict),local,remote,200,conflict.key),[conflict,local,remote]);
  const automatic=useMemo(()=>defaultMerge(conflict,local),[conflict,local]);
  const [choices,setChoices]=useState<Record<string,'local'|'remote'>>({});
  const [custom,setCustom]=useState<{value:unknown;deleted:boolean;name:string}|null>(null);
  const [error,setError]=useState('');
  const [filter,setFilter]=useState('');
  const [onlyConflicts,setOnlyConflicts]=useState(true);
  const [page,setPage]=useState(0);
  const [importing,setImporting]=useState(false);
  const candidate=useMemo(()=>{
    if(custom)return custom.deleted?undefined:custom.value;
    let value=automatic;
    for(const row of comparison.rows){const choice=choices[row.id];if(choice)value=chooseComparisonValue(value,row.path,choice==='local'?row.local:row.remote);}
    return value;
  },[automatic,choices,comparison.rows,custom]);
  const visible=comparison.rows.filter(row=>(!onlyConflicts||row.conflict)&&(!filter||row.label.toLowerCase().includes(filter.toLowerCase())||formatComparisonValue(row.local,200).toLowerCase().includes(filter.toLowerCase())||formatComparisonValue(row.remote,200).toLowerCase().includes(filter.toLowerCase())));
  const lastPage=Math.max(0,Math.ceil(visible.length/12)-1),currentPage=Math.min(page,lastPage),shown=visible.slice(currentPage*12,currentPage*12+12);
  const moduleLabel=BACKUP_PAGES.find(item=>item.id===legacyBackupPage(conflict.key))?.label??'页面数据';
  const unresolved=custom?0:comparison.conflictCount-comparison.rows.filter(row=>row.conflict&&choices[row.id]).length;
  const impact=useMemo(()=>compareSyncValues(local,local,candidate,12,conflict.key),[local,candidate,conflict.key]);
  function chooseField(id:string,path:Parameters<typeof chooseComparisonValue>[1],side:'local'|'remote',value:unknown) {
    setChoices(current=>({...current,[id]:side}));
    setCustom(current=>{
      if(!current)return null;
      const next=chooseComparisonValue(current.deleted?undefined:current.value,path,value);
      return {...current,value:next,deleted:next===undefined,name:current.name.endsWith('（已逐项调整）')?current.name:current.name+'（已逐项调整）'};
    });
  }
  async function submit(choice:SyncResolutionChoice,value?:unknown) {
    setError('');
    if(window.localStorage.getItem(conflict.key)!==localRaw){setError('本机内容刚有修改，请先点击“刷新对比”，再提交最新结果。');return;}
    const message=choice==='remote'?'将采用对比中的云端内容，本机当前内容会先备份。确认继续？'
      :'将把预览中的合并结果作为新版本上传。本机当前内容会先备份，上传前再次核对云端版本。确认继续？';
    if(!await siteConfirm(message).catch(cause=>{setError(cause instanceof Error?cause.message:'确认窗口无法打开，请重试。');return false;}))return;
    onSubmit({operationId:conflict.operationId,choice,review:{expectedLocal:localRaw,remoteRevision:conflict.remoteRevision,
      remoteHash:conflict.remoteHash,...(choice==='merged'?{value:value??null,deleted:value===undefined}:{})}});
  }
  async function importFile(file:File) {
    setError('');setImporting(true);
    try {
      if(file.size>24_000_000)throw Error('文件超过 24 MB 同步上限。');
      const result=parseMergeImport(await file.text(),conflict.key);setCustom({...result,name:file.name});setChoices({});
    } catch(cause){setError(cause instanceof Error?cause.message:'文件读取失败。');}
    finally{setImporting(false);}
  }
  return <section aria-label={`${moduleLabel}冲突对比`} className="overflow-hidden rounded-2xl border border-amber-500/50 bg-[var(--card)]">
    <header className="space-y-2 border-b border-[var(--card-border)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{moduleLabel} · 内容对比</h3><span className="text-xs text-[var(--muted-foreground)]">云端版本 {conflict.remoteRevision}</span></div>
      <p className="break-all text-xs text-[var(--muted-foreground)]">{conflict.key}</p>
      <p className="text-sm">{comparison.automaticCount} 项可自动处理，{comparison.conflictCount} 项需要你决定。只处理不同设备对同一内容的真实分歧，其余修改自动合并。</p>
      <p className="text-xs text-[var(--muted-foreground)]">判断依据：共同基线、字段实际改动、稳定条目 ID 和已登记的元数据规则。不会按设备时间直接覆盖正文、学习结果或删除操作。</p>
      <p className="text-xs text-[var(--muted-foreground)]">本机为当前页面已保存内容。云端为已下载的对比快照{conflict.remoteUpdatedAt?`（${new Date(conflict.remoteUpdatedAt).toLocaleString()}）`:''}，提交时再次检查版本。</p>
    </header>
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="搜索差异" value={filter} onChange={event=>{setFilter(event.target.value);setPage(0);}} placeholder="搜索名称或内容" className="min-w-0 flex-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyConflicts} onChange={event=>{setOnlyConflicts(event.target.checked);setPage(0);}}/>只看需要选择</label>
      </div>
      <div className="space-y-3">{shown.map(row=><article key={row.id} className="rounded-xl border border-[var(--card-border)] p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2"><h4 className="min-w-0 break-words text-sm font-semibold">{row.label}</h4><span className={`rounded px-2 py-0.5 text-xs ${row.conflict?'bg-amber-500/15 text-amber-700 dark:text-amber-300':'bg-blue-500/10 text-blue-700 dark:text-blue-300'}`}>{row.conflict?'双方修改':'可自动合并'}</span></div>
        <div className="grid gap-3 md:grid-cols-2">{(['local','remote'] as const).map(side=><div key={side} className="min-w-0 rounded-lg bg-[var(--background)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-semibold">{side==='local'?'本机当前内容':'云端快照'}</p><button type="button" disabled={disabled||importing} aria-pressed={(choices[row.id]??(!custom&&row.conflict?'local':undefined))===side} className="rounded-md border border-[var(--card-border)] px-2 py-1 text-xs aria-pressed:border-blue-500 aria-pressed:bg-blue-500/15 disabled:opacity-50" onClick={()=>chooseField(row.id,row.path,side,row[side])}>使用{side==='local'?'本机':'云端'}</button></div>
          <DifferenceValue value={row[side]} other={row[side==='local'?'remote':'local']}/>
        </div>)}</div>
        <details className="mt-2 text-xs text-[var(--muted-foreground)]"><summary className="cursor-pointer">查看共同基线</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">{formatComparisonValue(row.base)}</pre></details>
      </article>)}</div>
      {!shown.length&&<p className="text-sm text-[var(--muted-foreground)]">当前筛选没有差异。</p>}
      {visible.length>12&&<nav aria-label="差异分页" className="flex items-center justify-between text-sm"><button type="button" className={button} disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>上一页</button><span>{currentPage+1} / {lastPage+1}</span><button type="button" className={button} disabled={currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>下一页</button></nav>}
      {comparison.truncated&&<p className="text-xs text-[var(--muted-foreground)]">页面最多列出 200 项差异，需要选择的项目优先显示。仍有未选择项时不能直接提交默认结果，可明确选择完整本机内容或导入完整结果。</p>}
      <div className="space-y-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
        <h4 className="font-semibold">合并结果</h4>
        <p role="status" className="text-sm">{custom?`使用${custom.name}`:Object.keys(choices).length?`已逐项选择 ${Object.keys(choices).length} 项，其余沿用默认合并`:'使用默认合并，保留双方独有内容'}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={disabled||importing} className={button} onClick={()=>{setCustom({value:local,deleted:local===undefined,name:'本机完整内容作为结果'});setChoices({});}}>以本机完整内容作为结果</button>
          <button type="button" disabled={disabled||importing} className={button} onClick={()=>{setCustom(null);setChoices({});}}>恢复默认合并</button>
          <label className={`${button} cursor-pointer`}><span>{importing?'正在读取…':'导入本地 JSON 作为结果'}</span><input aria-label="导入本地 JSON 作为结果" type="file" accept=".json,application/json" disabled={disabled||importing} className="sr-only" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void importFile(file);}}/></label>
        </div>
        {custom&&<p className="text-xs text-[var(--muted-foreground)]">完整内容模式：云端独有记录也会以此结果为准。提交前请检查预览；导入只修改待提交结果。</p>}
        <details><summary className="cursor-pointer text-sm font-medium">预览将上传的结果</summary><div className="mt-3 space-y-3 text-sm"><p>相对本机将调整 {impact.total} 项{impact.total>12?'，先展示前 12 项':''}：</p>{impact.rows.map(row=><div key={row.id} className="rounded-lg bg-[var(--background)] p-3"><p className="font-medium">{row.label}</p><p className="mt-1 whitespace-pre-wrap break-words">{summarizeComparisonValue(row.remote).slice(0,1500)}</p></div>)}{!impact.total&&<p>保持本机内容，仍会向云端提交确认。</p>}</div></details>
        <details className="text-xs text-[var(--muted-foreground)]"><summary className="cursor-pointer">高级：查看原始 JSON</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words">{formatComparisonValue(candidate,12000)}</pre></details>
        {unresolved>0&&<p role="status" className="text-sm">还需选择 {unresolved} 项。可逐项选择，或明确使用本机 / 导入文件作为完整结果。</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={disabled||importing||unresolved>0} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={()=>void submit('merged',candidate)}>上传此合并结果</button>
          <button type="button" disabled={disabled||importing} className={button} onClick={()=>void submit('remote')}>采用云端完整内容</button>
          <button type="button" className="text-sm underline" onClick={()=>download(conflict.key,candidate,candidate===undefined,'merged')}>下载合并结果</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-[var(--muted-foreground)]"><button type="button" className="underline" onClick={()=>download(conflict.key,local,local===undefined,'local')}>下载本机内容</button><button type="button" className="underline" onClick={()=>download(conflict.key,remote,remote===undefined,'remote')}>下载云端内容</button></div>
      {error&&<p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  </section>;
}
