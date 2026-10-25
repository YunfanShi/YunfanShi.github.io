import { threeWayMerge } from './merge.ts';

export interface LocalEditStorage { getItem(key:string):string|null; setItem(key:string,value:string):void }
export const LOCAL_CONFLICT_PREFIX = 'jackyun_debug_unsaved_edit:';
export class LocalEditConflict extends Error {
  key:string;paths:string[];
  constructor(key:string, paths:string[]) { super('其他标签页也修改了相同内容。两份内容已保存在本机，请先下载未保存修改，再处理冲突。');this.key=key;this.paths=paths; }
}
export function parseLocalValue(raw:string|null):unknown {
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch { throw Error('本机数据无法解析，未覆盖原内容。'); }
}

/** All Schedule writers share this lock, including resumable-study completion. */
export async function persistLocalEdit(storage:LocalEditStorage,key:string,base:unknown,next:unknown,
  lock?: <T>(name:string,work:()=>Promise<T>)=>Promise<T>):Promise<unknown> {
  const work=async()=>{const result=persistLocalEditNow(storage,key,base,next);if('flush'in storage)await (storage as LocalEditStorage&{flush:()=>Promise<void>}).flush();return result;};
  return lock ? lock('jackyun:local-edit:'+key,work) : work();
}

export function persistLocalEditNow(storage:LocalEditStorage,key:string,base:unknown,next:unknown):unknown {
    const current=parseLocalValue(storage.getItem(key));
    const result=threeWayMerge(base,next,current);
    if(result.conflicts.length){
      // Excluded from cloud sync by the sensitive/debug key filter. Never silently
      // discard a React draft or use its timestamp to replace the other tab.
      storage.setItem(LOCAL_CONFLICT_PREFIX+key,JSON.stringify({base,local:next,remote:current,paths:result.conflicts}));
      throw new LocalEditConflict(key,result.conflicts);
    }
    const serialized=JSON.stringify(result.merged);
    if(serialized===undefined)throw Error('页面数据无效，原内容已保留。');
    if(storage.getItem(key)!==serialized)storage.setItem(key,serialized);
    return result.merged;
}

/** Queue UI intents using the preceding UI candidate, rather than a base
 * captured while an earlier save is waiting. Merged remote-only fields are
 * preserved when the following candidate predates its predecessor's render. */
export function createLocalEditWriter(storage:LocalEditStorage,key:string,
  lock?: <T>(name:string,work:()=>Promise<T>)=>Promise<T>) {
  let submitted:unknown,initialized=false,pending=0;
  let tail:Promise<unknown>=Promise.resolve();
  return {
    write(base:unknown,next:unknown):Promise<unknown> {
      const previous=initialized?submitted:base;
      submitted=next;initialized=true;pending++;
      const job=tail.catch(()=>{}).then(()=>persistLocalEdit(storage,key,previous,next,lock));
      tail=job;
      return job.finally(()=>{pending--;});
    },
    reset(base:unknown) {if(!pending){submitted=base;initialized=true;}},
  };
}
