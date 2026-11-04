import { BACKUP_PAGES, isBackupableLegacyKey, legacyBackupPage, type BackupPage } from './pages.ts';

export const LOCAL_SHARE_FORMAT='jackyun-local-page-share';
export type LocalSharePage={page:BackupPage;label:string;dataChangedAt:string|null;values:Record<string,string>};
export type LocalShareBundle={format:typeof LOCAL_SHARE_FORMAT;version:1;exportedAt:string;source:'JackYun Portal';pages:LocalSharePage[]};

const LABELS=new Map(BACKUP_PAGES.map(row=>[row.id,row.label]));
const CHANGE_FIELDS=/^(?:updatedAt|updated_at|lastUpdatedAt|last_updated_at|modifiedAt|modified_at|lastModifiedAt|last_modified_at|reviewedAt|lastReviewedAt|last_reviewed_at|completedAt|completed_at|answeredAt|answered_at|lastAttemptAt|last_attempt_at|recordedAt|recorded_at|savedAt|saved_at)$/i;

function timestamp(value:unknown):number|null{
  if(typeof value==='number'&&Number.isFinite(value))return value>10_000_000_000?value:value*1000;
  if(typeof value!=='string'||!value.trim())return null;
  const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:null;
}

export function latestDataChange(values:Record<string,string>):string|null{
  let latest=0;
  const visit=(value:unknown):void=>{
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value)){for(const child of value)visit(child);return;}
    for(const [key,child] of Object.entries(value as Record<string,unknown>)){
      if(CHANGE_FIELDS.test(key)){const parsed=timestamp(child);if(parsed)latest=Math.max(latest,parsed);}
      visit(child);
    }
  };
  for(const raw of Object.values(values)){try{visit(JSON.parse(raw));}catch{/* Text values have no structured timestamps. */}}
  return latest?new Date(latest).toISOString():null;
}

export function createLocalShare(snapshot:Record<string,string>,pages:readonly BackupPage[],now=new Date()):LocalShareBundle{
  const selected=[...new Set(pages)];
  return {format:LOCAL_SHARE_FORMAT,version:1,exportedAt:now.toISOString(),source:'JackYun Portal',pages:selected.map(page=>{
    const values=Object.fromEntries(Object.entries(snapshot).filter(([key])=>isBackupableLegacyKey(key)&&legacyBackupPage(key)===page));
    return {page,label:LABELS.get(page)??page,dataChangedAt:latestDataChange(values),values};
  })};
}

export function parseLocalShare(text:string):LocalShareBundle{
  let raw:unknown;try{raw=JSON.parse(text);}catch{throw new Error('文件不是有效的 JSON。');}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('本地分享文件格式无效。');
  const bundle=raw as Partial<LocalShareBundle>;
  if(bundle.format!==LOCAL_SHARE_FORMAT||bundle.version!==1||!Array.isArray(bundle.pages)||!bundle.pages.length)throw new Error('这不是 JackYun Portal 本地分享文件。');
  const seen=new Set<BackupPage>();
  const normalized=new Map<BackupPage,LocalSharePage>();
  for(const row of bundle.pages){
    if(!row||!BACKUP_PAGES.some(page=>page.id===row.page)||seen.has(row.page))throw new Error('分享文件包含无效或重复页面。');
    seen.add(row.page);
    if(!row.values||typeof row.values!=='object'||Array.isArray(row.values))throw new Error(`${LABELS.get(row.page)} 数据格式无效。`);
    const targetValues:Record<string,string>={},movedValues:Array<[BackupPage,string,string]>=[];
    for(const [key,value] of Object.entries(row.values)){
      if(typeof value!=='string'||!isBackupableLegacyKey(key))throw new Error(`${key} 不是允许分享的数据。`);
      const targetPage=legacyBackupPage(key);
      // Older bundles classified newly-local-only CUE answer drafts as "other".
      if(targetPage!==row.page&&!(row.page==='other'&&targetPage==='study'&&key.startsWith('jackyun_cue_answer_draft_v1:')))throw new Error(`${key} 不是该页面允许分享的数据。`);
      if(targetPage===row.page)targetValues[key]=value;else movedValues.push([targetPage,key,value]);
    }
    if(row.dataChangedAt!==null&&row.dataChangedAt!==undefined&&!Number.isFinite(Date.parse(row.dataChangedAt)))throw new Error(`${LABELS.get(row.page)} 的数据修改时间无效。`);
    const prior=normalized.get(row.page);
    normalized.set(row.page,{...row,values:{...(prior?.values??{}),...targetValues}});
    for(const [targetPage,key,value] of movedValues){
      const moved=normalized.get(targetPage);normalized.set(targetPage,{page:targetPage,label:LABELS.get(targetPage)??targetPage,dataChangedAt:row.dataChangedAt??null,values:{...(moved?.values??{}),[key]:value}});
    }
  }
  return {...bundle,pages:[...normalized.values()]} as LocalShareBundle;
}
