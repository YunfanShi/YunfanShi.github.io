'use client';

import {useEffect} from 'react';
import {fetchSyncWithTimeout} from '@/lib/request-timeout';
import {syncRetryDelay,shouldPauseSync} from '@/lib/sync/retry-policy';
import {BEFORE_SLEEP_EVENT,LOCAL_SLEEP_SAVE_EVENT,WAKE_EVENT,isWorkspaceSleeping,type SleepRequest} from '@/lib/workspace-idle';
import {createSyncRunGate} from '@/lib/sync/run-gate';
import {announceSyncStatus as announce,getLatestSyncStatus} from '@/lib/sync/status';
import {CLOUD_STATE_APPLIED_EVENT,MAX_SYNC_VALUE_CHARACTERS,isSyncableStorageKey} from '@/lib/local-workspace';
import * as syncStore from '@/lib/sync/outbox';
import {getSetting} from '@/lib/sync/outbox';
import {createWorkspaceSync} from '@/lib/sync/engine';
import {isBackupableLegacyKey,legacyBackupPage,type BackupPage} from '@/lib/backup/pages';
import {localPageValues,saveLocalBackup} from '@/lib/backup/local';
import {backupIsDue,recordBackupChange,type PendingBackup} from '@/lib/backup/cadence';
import {createDueBackupVersions} from '@/actions/backup-center';
import {emitDiagnostic,errorDetails} from '@/lib/diagnostic-events';
import {syncFailureStatus} from '@/lib/sync/service-error';
import type {SyncStatus,SyncResolutionRequest} from '@/types/sync';

function localSnapshot(includeLarge = false): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !isSyncableStorageKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value !== null && (includeLarge || value.length <= MAX_SYNC_VALUE_CHARACTERS)) snapshot[key] = value;
  }
  return snapshot;
}

function deviceDescription() {
  const mobile=/Android|iPhone|iPad/i.test(navigator.userAgent), standalone=window.matchMedia('(display-mode: standalone)').matches;
  return {name:`${mobile?'Mobile':'Desktop'} ${standalone?'PWA':'Browser'}`,platform:standalone?'pwa':mobile?'mobile-web':'web'};
}

export default function LocalWorkspaceSync({ userId }: { userId: string | null }) {
  useEffect(() => {
    let owner = userId ?? 'guest';
    let previous = localSnapshot(true);
    let pending = Promise.resolve();
    let baselineFailed = false;
    const dirtyPages = new Map<BackupPage, PendingBackup>();
    const capture = () => {
      const current = localSnapshot(true);
      const now = Date.now();
      for (const key of new Set([...Object.keys(previous), ...Object.keys(current)])) {
        if (previous[key] !== current[key] && isBackupableLegacyKey(key)) {
          const page = legacyBackupPage(key);
          const bytes = new TextEncoder().encode(current[key] ?? previous[key] ?? '').byteLength;
          dirtyPages.set(page, recordBackupChange(dirtyPages.get(page), bytes, now));
        }
      }
      previous = current;
    };
    const checkpoint = (force = false) => {
      capture();
      const now = Date.now();
      const pages = [...dirtyPages].filter(([, pendingPage]) => force || backupIsDue(pendingPage, now));
      for (const [page] of pages) dirtyPages.delete(page);
      const snapshot = previous;
      if (!pages.length) return pending;
      pending = pending.then(async () => {
        for (const [page, pendingPage] of pages) {
          try { await saveLocalBackup(owner, page, localPageValues(snapshot, page)); }
          catch (error) {
            const newer = dirtyPages.get(page);
            dirtyPages.set(page, {
              bytes: Math.max(pendingPage.bytes, newer?.bytes ?? 0),
              firstChangedAt: Math.min(pendingPage.firstChangedAt, newer?.firstChangedAt ?? pendingPage.firstChangedAt),
            });
            console.error('[Backup] Local version write failed', error);
          }
        }
      });
      return pending;
    };
    pending = pending.then(async () => {
      owner = userId ?? await getSetting<string>('activeUserId') ?? 'guest';
      for (const page of new Set(Object.keys(previous).filter(isBackupableLegacyKey).map(legacyBackupPage))) {
        await saveLocalBackup(owner, page, localPageValues(previous, page));
      }
    }).catch((error) => { baselineFailed = true; console.error('[Backup] Local baseline failed', error); });
    // localStorage already persists edits immediately. This fallback discovers
    // changes for version backups; exits and sleep still force a checkpoint.
    const timer = window.setInterval(() => {
      if (!isWorkspaceSleeping() && document.visibilityState === 'visible') checkpoint();
    }, 15_000);
    const onSleep = (event: Event) => {
      (event as CustomEvent<SleepRequest>).detail.waitUntil(Promise.resolve(checkpoint(true)).then(() => {
        if (dirtyPages.size || baselineFailed) throw new Error('Local backup failed');
      }));
    };
    window.addEventListener(LOCAL_SLEEP_SAVE_EVENT, onSleep);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || isBackupableLegacyKey(event.key)) checkpoint();
    };
    const onLeave = () => checkpoint(true);
    const onVisibility = () => { if (document.visibilityState === 'hidden') onLeave(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.removeEventListener(LOCAL_SLEEP_SAVE_EVENT, onSleep); onLeave(); window.clearInterval(timer); window.removeEventListener('storage', onStorage); window.removeEventListener('pagehide', onLeave); document.removeEventListener('visibilitychange', onVisibility); };
  }, [userId]);

  useEffect(() => {
    if (!userId) { announce({state:'guest',pending:0,conflicts:0,lastSyncedAt:null}); return; }
    let cancelled=false, signingOut=false, bound=false, failures=0, retryAt=0, authPaused=false, lastBackupCheck=0;
    const controller=new AbortController(), gate=createSyncRunGate();
    const publish=async (state:SyncStatus,error?:string,progress?:string) => {
      const [pending,conflicts,lastSyncedAt]=await Promise.all([syncStore.getOutbox(),syncStore.getConflicts(),getSetting<string>('lastSyncedAt')]);
      if(cancelled) return;
      announce({state:conflicts.length && state!=='syncing' && state!=='error' && state!=='server_unavailable' ? 'conflict' : state==='synced' && pending.length ? 'offline_pending' : state,
        pending:pending.length,conflicts:conflicts.length,lastSyncedAt,error,progress,consecutiveFailures:failures});
    };
    let requestReason='periodic';
    const engine=createWorkspaceSync({store:syncStore,snapshot:()=>localSnapshot(true),read:key=>localStorage.getItem(key),
      write:(key,value)=>{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);},
      backup:async key=>{if(isBackupableLegacyKey(key))await saveLocalBackup(userId,legacyBackupPage(key),localPageValues(localSnapshot(true),legacyBackupPage(key)));},
      changed:keys=>window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT,{detail:{keys,source:'cloud'}})),
      request:(url,init)=>fetchSyncWithTimeout(url,{...init,headers:{...init?.headers,'X-Sync-Reason':requestReason},signal:controller.signal},false),
      progress:progress=>{if(!cancelled){const current=getLatestSyncStatus();announce({...current??{state:'syncing',pending:0,conflicts:0,lastSyncedAt:null},progress});}},
      deviceId:syncStore.getOrCreateDeviceId,device:deviceDescription,cancelled:()=>cancelled||signingOut,now:Date.now,uuid:()=>crypto.randomUUID(),
    });
    let queuedResolution: SyncResolutionRequest | undefined;
    async function sync(manual=false,allowHidden=false,resolution?:SyncResolutionRequest,reason=manual?'manual':'periodic') {
      if(cancelled||signingOut||!bound||isWorkspaceSleeping())return;
      if(!manual&&!allowHidden&&document.visibilityState!=='visible'){await engine.capture();return;}
      if(resolution)queuedResolution=resolution;
      if(!gate.begin(manual))return;
      requestReason=reason;
      if(manual){authPaused=false;retryAt=0;}
      try {
        const work=async()=>{
          if(cancelled||signingOut)return;
          await engine.capture();
          if(!navigator.onLine){await publish('offline_pending');return;}
          if(authPaused||Date.now()<retryAt)return;
          const [pending,conflicts,lastRead]=await Promise.all([syncStore.getOutbox(),syncStore.getConflicts(),getSetting<number>('lastAutomaticPull')]);
          const blocked=new Set(conflicts.map(c=>c.key));
          if(!manual&&!queuedResolution&&!pending.some(op=>!blocked.has(op.key))&&Date.now()-(lastRead??0)<60_000){await publish('synced');return;}
          await publish('syncing',undefined,'正在核对云端版本，本机原始数据会保留…');
          if(queuedResolution){const choice=queuedResolution;await engine.resolve(choice.operationId,choice.choice,choice.review);if(queuedResolution===choice)queuedResolution=undefined;await engine.flush();}
          await engine.synchronize();
          await engine.capture();
          await syncStore.setSetting('lastAutomaticPull',Date.now());
          const remaining=await syncStore.getOutbox(), unresolved=await syncStore.getConflicts();
          if(!remaining.length&&!unresolved.length)await syncStore.setSetting('lastSyncedAt',new Date().toISOString());
          failures=0;retryAt=0;
          if(Date.now()-lastBackupCheck>=5*60_000){lastBackupCheck=Date.now();try{await createDueBackupVersions();}catch{console.warn('[Backup] Cloud backup deferred');}}
          await publish(unresolved.length?'conflict':remaining.length?'offline_pending':'synced',undefined,
            unresolved.length?'存在不能安全合并的修改，两份内容已保留，请到设置的同步中心处理。':remaining.length?'本机修改仍在队列中，将分批继续上传。':undefined);
        };
        if(navigator.locks)await navigator.locks.request('jackyun:workspace-sync:'+userId,manual?{signal:controller.signal}:{ifAvailable:true},async lock=>{if(lock)await work();});
        else await work();
      } catch(error) {
        if(cancelled||signingOut)return;
        if(error instanceof Error && error.name==='SyncReviewChangedError') {
          queuedResolution=undefined;
          await publish('conflict',undefined,error.message);return;
        }
        failures++;retryAt=Date.now()+syncRetryDelay(failures);
        authPaused=shouldPauseSync(error)||(error as {status?:number}).status===426;
        emitDiagnostic('error','WorkspaceSync','同步未确认，原始内容与待上传修改保留',{error:errorDetails(error),failures,online:navigator.onLine});
        await publish(syncFailureStatus(error,navigator.onLine,failures),error instanceof Error?error.message:'同步失败');
      } finally {if(gate.finish()&&!cancelled&&!signingOut)void sync(true);}
    }
    localStorage.removeItem('jackyun_guest_mode');
    void publish('syncing',undefined,'正在初始化版本同步…');
    void syncStore.bindSyncUser(userId).then(()=>{bound=true;return sync();}).catch(error=>void publish('error',error instanceof Error?error.message:'无法绑定账号'));
    let editTimer:number|null=null;
    const onEdit=()=>{if(editTimer!==null)window.clearTimeout(editTimer);editTimer=window.setTimeout(()=>{editTimer=null;void sync(false,false,undefined,'edit');},8_000);};
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void sync();},30_000);
    const onOnline=()=>{retryAt=0;void sync(false,false,undefined,'online');};
    const onWake=()=>void sync(false,false,undefined,'resume');
    const onOffline=()=>void publish('offline_pending');
    const onRetry=()=>void sync(true);
    const onResolve=(event:Event)=>{const detail=(event as CustomEvent<SyncResolutionRequest>).detail;if(detail?.operationId&&['local','remote','merged'].includes(detail.choice))void sync(true,false,detail);};
    const onVisibility=()=>{if(document.visibilityState==='visible')void sync();else void engine.capture();};
    const onLeave=()=>void engine.capture();
    const onSignOut=()=>{signingOut=true;};
    const onCancel=()=>{signingOut=false;};
    const onBeforeSignOut=(event:Event)=>{const complete=(event as CustomEvent<{complete:()=>void}>).detail?.complete;void engine.capture().then(()=>sync(false,true)).finally(()=>complete?.());};
    const onSleep=(event:Event)=>(event as CustomEvent<SleepRequest>).detail.waitUntil((async()=>{await gate.waitForIdle();await engine.capture();await sync(false,true);})());
    const listeners:[string,EventListener][]=[['online',onOnline],['offline',onOffline],['focus',onWake],['pagehide',onLeave],
      ['jackyun-sync-retry',onRetry],['jackyun-sync-resolve',onResolve],['jackyun-sync-edit',onEdit],['jackyun-signout-start',onSignOut],
      ['jackyun-signout-cancel',onCancel],['jackyun-sync-before-signout',onBeforeSignOut],[BEFORE_SLEEP_EVENT,onSleep],[WAKE_EVENT,onWake]];
    for(const [name,listener]of listeners)window.addEventListener(name,listener);
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{cancelled=true;controller.abort();window.clearInterval(timer);if(editTimer!==null)window.clearTimeout(editTimer);
      for(const [name,listener]of listeners)window.removeEventListener(name,listener);document.removeEventListener('visibilitychange',onVisibility);};
  },[userId]);
  return null;
}
