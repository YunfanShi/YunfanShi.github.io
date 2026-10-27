'use client';
import { useEffect,useState } from 'react';
import { LOCAL_DURABILITY_EVENT,exportLocalRecovery,getLocalSaveState } from '@/lib/sync/repository';
import {getSetting,accountSyncStore} from '@/lib/sync/outbox';
import {listOfflineMutations} from '@/lib/offline/workspace';
export type LocalSaveState='saving'|'saved'|'storage_error'|'projection_degraded';
export function useLocalSaveState(){
  const [state,setState]=useState<LocalSaveState>('saving');
  useEffect(()=>{queueMicrotask(()=>setState(getLocalSaveState()));const listener=(event:Event)=>setState((event as CustomEvent<{state:LocalSaveState}>).detail.state);
    window.addEventListener(LOCAL_DURABILITY_EVENT,listener);return()=>window.removeEventListener(LOCAL_DURABILITY_EVENT,listener);},[]);
  return state;
}
export async function downloadLocalRecovery(){
  const bundle=JSON.parse(exportLocalRecovery());
  try{const owner=await getSetting<string>('activeUserId');if(owner){const store=accountSyncStore(owner);bundle.operations=await store.getOutbox();bundle.submission=await store.getSubmission();bundle.conflicts=await store.getConflicts();bundle.offlineOperations=await listOfflineMutations(owner);}}
  catch{bundle.queueReadUnavailable=true;}
  const url=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='JACKYUN-local-recovery.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function LocalDurabilityNotice(){
  return null;
}
