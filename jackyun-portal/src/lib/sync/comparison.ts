import {canonicalJson} from './hash.ts';
import {mergeWorkspaceValues} from './merge-policy.ts';
import type {SyncConflict} from '../../types/sync.ts';

export type ComparisonPath = Array<string | {id:string}>;
export interface ComparisonRow {
  id:string;path:ComparisonPath;label:string;base:unknown;local:unknown;remote:unknown;conflict:boolean;
}
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const same=(a:unknown,b:unknown)=>(a===undefined)===(b===undefined)&&canonicalJson(a)===canonicalJson(b);
const identified=(value:unknown):value is Array<Record<string,unknown>&{id:string}>=>Array.isArray(value)
  &&value.every(item=>object(item)&&typeof item.id==='string'&&item.id.length>0)&&new Set(value.map(item=>item.id)).size===value.length;
const labels:Record<string,string>={cues:'CUE',text:'内容',title:'标题',name:'名称',answer:'答案',question:'题目',prompt:'题目',ms:'评分点',markingPoints:'评分点',
  subjectName:'科目',unit:'单元',subsection:'小节',version:'内容版本',intervalDays:'复习间隔',nextReviewDate:'下次复习日期',lastReviewedAt:'最近复习时间',streak:'连续记录',easeFactor:'复习系数',
  manualTasks:'任务',timetable:'课表',completions:'完成记录',cueStudyDrafts:'学习进度',updatedAt:'更新时间',createdAt:'创建时间',
  subjects:'科目',notes:'笔记',description:'说明',status:'状态',content:'正文',settings:'设置',rows:'条目',draft:'草稿'};

/** Compare semantic fields, matching list records by ID instead of JSON line numbers. */
export function compareSyncValues(base:unknown,local:unknown,remote:unknown,limit=200,key='') {
  const rows:ComparisonRow[]=[];let truncated=false;
  let total=0,conflictCount=0;
  function visit(b:unknown,l:unknown,r:unknown,path:ComparisonPath,names:string[],mergePath='$') {
    if(same(l,r))return;
    if(object(l)&&object(r)&&(b===undefined||b===null||object(b))) {
      const original=object(b)?b:{};
      for(const key of new Set([...Object.keys(original),...Object.keys(l),...Object.keys(r)])) {
        visit(Object.hasOwn(original,key)?original[key]:undefined,Object.hasOwn(l,key)?l[key]:undefined,Object.hasOwn(r,key)?r[key]:undefined,[...path,key],[...names,labels[key]??key],`${mergePath}.${key}`);
      }
      return;
    }
    if(identified(l)&&identified(r)&&(b===undefined||b===null||identified(b))) {
      const original=identified(b)?b:[],remoteIds=new Set(r.map(item=>item.id));
      const common=l.filter(item=>remoteIds.has(item.id)).map(item=>item.id),commonIds=new Set(common);
      const remoteOrder=r.filter(item=>commonIds.has(item.id)).map(item=>item.id);
      if(same(common,remoteOrder)) {
        const bm=new Map(original.map(item=>[item.id,item])),lm=new Map(l.map(item=>[item.id,item])),rm=new Map(r.map(item=>[item.id,item]));
        for(const id of new Set([...bm.keys(),...lm.keys(),...rm.keys()])) {
          const record=lm.get(id)??rm.get(id)??bm.get(id)!;
          const title=[record.subjectName,record.unit,record.title??record.name??record.prompt??record.question??record.text??id].filter(Boolean).map(String).join(' · ').slice(0,100);
          visit(bm.get(id),lm.get(id),rm.get(id),[...path,{id}],[...names,title],`${mergePath}[${id}]`);
        }
        return;
      }
    }
    const row={id:JSON.stringify(path),path,label:names.join(' / ')||'整份内容',base:b,local:l,remote:r,
      conflict:mergeWorkspaceValues(key,b,l,r,mergePath).conflicts.length>0};
    total++;if(row.conflict)conflictCount++;
    if(rows.length<limit)rows.push(row);
    else {truncated=true;if(row.conflict){const index=rows.findLastIndex(item=>!item.conflict);if(index>=0)rows[index]=row;}}
  }
  visit(base,local,remote,[],[]);
  rows.sort((a,b)=>Number(b.conflict)-Number(a.conflict));
  return {rows,truncated,total,conflictCount,automaticCount:total-conflictCount};
}

/** Apply a reviewed field without interpreting property names as executable paths. */
export function chooseComparisonValue(value:unknown,path:ComparisonPath,chosen:unknown):unknown {
  if(!path.length)return structuredClone(chosen);
  const [head,...tail]=path;
  if(typeof head==='object') {
    const result=Array.isArray(value)?value.slice():[];
    const index=result.findIndex(item=>object(item)&&item.id===head.id);
    const next=chooseComparisonValue(index<0?undefined:result[index],tail,chosen);
    if(next===undefined){if(index>=0)result.splice(index,1);}
    else if(index<0)result.push(next);else result[index]=next;
    return result;
  }
  const result=object(value)?{...value}:{};
  const next=chooseComparisonValue(Object.hasOwn(result,head)?result[head]:undefined,tail,chosen);
  if(next===undefined)delete result[head];
  else Object.defineProperty(result,head,{value:next,enumerable:true,writable:true,configurable:true});
  return result;
}

export function conflictBase(conflict:SyncConflict):unknown {
  return conflict.baseRevision===0||conflict.baseDeleted?undefined:conflict.baseValue;
}
export function readComparisonLocal(raw:string|null):unknown {
  if(raw===null)return undefined;
  try{return JSON.parse(raw);}catch{return raw;}
}
export function defaultMerge(conflict:SyncConflict,local:unknown):unknown {
  return mergeWorkspaceValues(conflict.key,conflictBase(conflict),local,conflict.remoteDeleted?undefined:conflict.remoteValue).merged;
}
export function formatComparisonValue(value:unknown,max=1200):string {
  if(value===undefined)return '（已删除 / 不存在）';
  const text=typeof value==='string'?value:JSON.stringify(value,null,2);
  return text.length>max?text.slice(0,max)+'\n… 内容较长，可下载完整内容':text;
}

/** Product-readable summaries; exact JSON remains available in advanced export. */
export function summarizeComparisonValue(value:unknown):string {
  if(value===undefined)return '已删除 / 不存在';
  if(value===null)return '空值';
  if(typeof value==='boolean')return value?'是':'否';
  if(Array.isArray(value))return `${value.length} 条记录`+(value.length?'\n'+value.slice(0,5).map((item,index)=>`${index+1}. ${object(item)?String(item.prompt??item.title??item.name??item.text??item.content??'记录'):String(item)}`).join('\n')+(value.length>5?'\n…':'' ):'');
  if(object(value)) {
    const entries=Object.entries(value).filter(([key])=>!['id','schemaVersion'].includes(key));
    return entries.slice(0,7).map(([key,item])=>`${labels[key]??key}：${Array.isArray(item)?`${item.length} 条`:object(item)?`${Object.keys(item).length} 项`:item===null?'空':String(item)}`).join('\n')+(entries.length>7?'\n…':'');
  }
  return String(value);
}

export function comparisonTextParts(value:string,other:string) {
  let start=0,end=value.length,otherEnd=other.length;
  while(start<end&&start<otherEnd&&value[start]===other[start])start++;
  while(end>start&&otherEnd>start&&value[end-1]===other[otherEnd-1]){end--;otherEnd--;}
  const change=value.slice(start,end);
  return {before:(start>100?'…':'')+value.slice(Math.max(0,start-100),start),
    change:change.length>1200?change.slice(0,1200)+'…':change,
    after:value.slice(end,end+100)+(value.length-end>100?'…':'')};
}

export function parseMergeImport(text:string,key:string):{value:unknown;deleted:boolean} {
  if(new TextEncoder().encode(text).length>24_000_000)throw Error('文件超过 24 MB 同步上限。');
  let parsed:unknown;
  try{parsed=JSON.parse(text);}catch{throw Error('文件不是有效的 JSON，请检查后重新导入。');}
  if(object(parsed)&&parsed.format==='jackyun-sync-merge-v1') {
    if(parsed.key!==key)throw Error('此文件属于其他同步项目，不能用于当前合并。');
    if(typeof parsed.deleted!=='boolean'||(!parsed.deleted&&!Object.hasOwn(parsed,'value')))throw Error('合并文件缺少有效内容。');
    return {value:parsed.value,deleted:parsed.deleted};
  }
  if(object(parsed)&&Object.hasOwn(parsed,'remoteValue')&&Object.hasOwn(parsed,'localValue'))throw Error('这是两份内容的冲突备份。请导入单份数据，或在页面选择本机 / 云端内容。');
  return {value:parsed,deleted:false};
}
