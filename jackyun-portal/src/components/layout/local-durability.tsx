'use client';
import { useEffect,useState } from 'react';
import { LOCAL_DURABILITY_EVENT,exportLocalRecovery,getLocalSaveState } from '@/lib/sync/repository';
import {getSetting,accountSyncStore,getV5Conflicts,getV5Outbox} from '@/lib/sync/outbox';
import {listOfflineMutations} from '@/lib/offline/workspace';
export type LocalSaveState='saving'|'saved'|'storage_error'|'projection_degraded';
export function useLocalSaveState(){
  const [state,setState]=useState<LocalSaveState>('saving');
  useEffect(()=>{queueMicrotask(()=>setState(getLocalSaveState()));const listener=(event:Event)=>setState((event as CustomEvent<{state:LocalSaveState}>).detail.state);
    window.addEventListener(LOCAL_DURABILITY_EVENT,listener);return()=>window.removeEventListener(LOCAL_DURABILITY_EVENT,listener);},[]);
  return state;
}
export async function downloadLocalRecovery():Promise<boolean>{
  const bundle=JSON.parse(exportLocalRecovery());
  try{const owner=await getSetting<string>('activeUserId');if(!owner)throw Error('active account missing');const store=accountSyncStore(owner);bundle.operations=await store.getOutbox();bundle.submission=await store.getSubmission();bundle.conflicts=await store.getConflicts();bundle.v5Operations=await getV5Outbox(undefined,`jackyun-sync-v2:${owner}`);bundle.v5Conflicts=await getV5Conflicts(`jackyun-sync-v2:${owner}`);bundle.offlineOperations=await listOfflineMutations(owner);}
  catch{throw Error('本机恢复副本未能完整读取队列；为保护待上传修改，已取消重新获取。');}
  const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='JACKYUN-local-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  return true;
}
export default function LocalDurabilityNotice(){
  return null;
}
