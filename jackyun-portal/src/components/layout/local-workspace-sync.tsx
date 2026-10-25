'use client';

import {useEffect} from 'react';
import LocalDurabilityNotice from './local-durability';
import {fetchAuthenticatedSync as fetchSyncWithTimeout} from '@/lib/sync/session-transport';
import {shouldPauseSync} from '@/lib/sync/retry-policy';
import {runScheduledSync,createEditTrigger} from '@/lib/sync/scheduler';
import {workspaceStorage,initializeRepository,flushLocalWrites,applyRepositoryRecord} from '@/lib/sync/repository';
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
import {reportSyncFailure} from '@/lib/sync/report-failure';
import type {SyncStatus,SyncResolutionRequest} from '@/types/sync';

function localSnapshot(includeLarge = false): Record<string, string> {
  if(workspaceStorage.snapshot)return Object.fromEntries(Object.entries(workspaceStorage.snapshot()).filter(([,value])=>includeLarge||value.length<=MAX_SYNC_VALUE_CHARACTERS));
  const snapshot: Record<string, string> = {};
  for (let index = 0; index < workspaceStorage.length; index += 1) {
    const key = workspaceStorage.key(index);
    if (!key || !isSyncableStorageKey(key)) continue;
    const value = workspaceStorage.getItem(key);
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
    // Repository transactions persist edits before updating the projection. This fallback discovers
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
    if (!userId) { void initializeRepository(null).catch(()=>{});announce({state:'guest',pending:0,conflicts:0,lastSyncedAt:null}); return; }
    let cancelled=false, signingOut=false, bound=false, failures=0, authPaused=false, lastBackupCheck=0;
    const controller=new AbortController(), gate=createSyncRunGate();
    const accountStore=syncStore.accountSyncStore(userId);
    const publish=async (state:SyncStatus,error?:string,progress?:string) => {
      const [pending,conflicts,lastSyncedAt]=await Promise.all([accountStore.getOutbox(),accountStore.getConflicts(),accountStore.getSetting<string>('lastSyncedAt')]);
      if(cancelled) return;
      announce({state:conflicts.length && state!=='syncing' && state!=='error' && state!=='server_unavailable' && state!=='auth_required' && state!=='access_denied' ? 'conflict' : state==='synced' && pending.length ? 'offline_pending' : state,
        pending:pending.length,conflicts:conflicts.length,lastSyncedAt,error,progress,consecutiveFailures:failures});
    };
    let requestReason='periodic';
    const engine=createWorkspaceSync({store:accountStore,snapshot:()=>localSnapshot(true),read:key=>workspaceStorage.getItem(key),
      write:async(key,value,expected)=>{if(cancelled||signingOut)throw new DOMException('Sync cancelled','AbortError');await applyRepositoryRecord(key,value,expected);},
      backup:async key=>{if(isBackupableLegacyKey(key))await saveLocalBackup(userId,legacyBackupPage(key),localPageValues(localSnapshot(true),legacyBackupPage(key)));},
      changed:keys=>window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT,{detail:{keys,source:'cloud'}})),
      request:(url,init)=>fetchSyncWithTimeout(url,{...init,headers:{...init?.headers,'X-Sync-Reason':requestReason,'X-Sync-Account':userId},signal:controller.signal},false),
      progress:progress=>{if(!cancelled){const current=getLatestSyncStatus();announce({...current??{state:'syncing',pending:0,conflicts:0,lastSyncedAt:null},progress});}},
      deviceId:accountStore.getOrCreateDeviceId,device:deviceDescription,cancelled:()=>cancelled||signingOut||syncStore.isSyncLeaseLost?.(`recovery:${userId}:workspace`)===true,now:Date.now,uuid:()=>crypto.randomUUID(),
    });
    let queuedResolution: SyncResolutionRequest | undefined;
    async function sync(manual=false,allowHidden=false,resolution?:SyncResolutionRequest,reason=manual?'manual':'periodic') {
      if(cancelled||signingOut||!bound||isWorkspaceSleeping())return;
      if(!manual&&!allowHidden&&document.visibilityState!=='visible'){await engine.capture();return;}
      if(resolution)queuedResolution=resolution;
      if(!gate.begin(manual))return;
      requestReason=reason;
      if(manual){authPaused=false;}
      try {
        const work=async()=>{
          if(cancelled||signingOut)return false;
          await flushLocalWrites();await engine.capture();
          if(!navigator.onLine){await publish('offline_pending');return false;}
          if(authPaused)return false;
          const [pending,conflicts,lastRead]=await Promise.all([accountStore.getOutbox(),accountStore.getConflicts(),accountStore.getSetting<number>('lastAutomaticPull')]);
          const blocked=new Set(conflicts.map(c=>c.key));
          if(!manual&&!queuedResolution&&!pending.some(op=>!blocked.has(op.key))&&Date.now()-(lastRead??0)<30_000){await publish('synced');return false;}
          await publish('syncing',undefined,'正在核对云端版本，本机原始数据会保留…');
          if(queuedResolution){const choice=queuedResolution;await engine.resolve(choice.operationId,choice.choice,choice.review);if(queuedResolution===choice)queuedResolution=undefined;await engine.flush();}
          await engine.synchronize();
          await flushLocalWrites();await engine.capture();
          await accountStore.setSetting('lastAutomaticPull',Date.now());
          const remaining=await accountStore.getOutbox(), unresolved=await accountStore.getConflicts();
          if(!remaining.length&&!unresolved.length)await accountStore.setSetting('lastSyncedAt',new Date().toISOString());
          failures=0;
          if(Date.now()-lastBackupCheck>=5*60_000){lastBackupCheck=Date.now();void runScheduledSync('backup',userId!,async()=>{await createDueBackupVersions();}).catch(()=>console.warn('[Backup] Cloud backup deferred'));}
          await publish(unresolved.length?'conflict':remaining.length?'offline_pending':'synced',undefined,
            unresolved.length?'存在不能安全合并的修改，两份内容已保留，请到设置的同步中心处理。':remaining.length?'本机修改仍在队列中，将分批继续上传。':undefined);
          return true;
        };
        await runScheduledSync('workspace',userId!,work,manual);
      } catch(error) {
        if(cancelled||signingOut)return;
        if(error instanceof Error && error.name==='SyncReviewChangedError') {
          queuedResolution=undefined;
          await publish('conflict',undefined,error.message);return;
        }
        failures++;
        authPaused=shouldPauseSync(error)||(error as {status?:number}).status===426;
        emitDiagnostic('error','WorkspaceSync','同步未确认，原始内容与待上传修改保留',{error:errorDetails(error),failures,online:navigator.onLine});
        void reportSyncFailure(error,'cycle');
        await publish(syncFailureStatus(error,navigator.onLine,failures),error instanceof Error?error.message:'同步失败');
      } finally {if(gate.finish()&&!cancelled&&!signingOut)void sync(true);}
    }
    workspaceStorage.removeItem('jackyun_guest_mode');
    void publish('syncing',undefined,'正在初始化版本同步…');
    const initialize=()=>initializeRepository(userId).then(()=>{bound=true;return sync();}).catch(error=>{
      void reportSyncFailure(error,'initialization');
      void publish('error',error instanceof Error?error.message:'无法绑定账号');
    });
    void initialize();
    const editTrigger=createEditTrigger(()=>{void sync(false,false,undefined,'edit');});
    const onEdit=()=>editTrigger.trigger();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible'){if(!bound)void initialize();else void sync();}},30_000);
    const recoveryTimers=new Map<string,ReturnType<typeof setTimeout>>();
    const onLane=(event:Event)=>{
      const lane=(event as CustomEvent<{userId:string;lane:string;state:string;nextAttemptAt:number;openUntil:number}>).detail;
      if(lane.userId!==userId||!['workspace','backup'].includes(lane.lane))return;
      const previous=recoveryTimers.get(lane.lane);if(previous)clearTimeout(previous);
      if(lane.state!=='waiting')return;
      recoveryTimers.set(lane.lane,setTimeout(()=>{
        if(cancelled||signingOut||document.visibilityState!=='visible'||isWorkspaceSleeping())return;
        if(lane.lane==='workspace')void sync();
        else void runScheduledSync('backup',userId!,async()=>{await createDueBackupVersions();}).catch(()=>{});
      },Math.max(100,Math.max(lane.nextAttemptAt,lane.openUntil)-Date.now())));
    };
    window.addEventListener('jackyun-sync-lane',onLane);
    const onOnline=()=>{if(!bound)void initialize();else void sync(false,false,undefined,'online');};
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
    const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('jackyun-sync:'+userId):null;
    if(channel)channel.onmessage=()=>onEdit();
    const onDurable=(event:Event)=>{if((event as CustomEvent).detail?.state==='saved')channel?.postMessage({wake:true});};
    window.addEventListener('jackyun-local-durability',onDurable);
    const listeners:[string,EventListener][]=[['online',onOnline],['offline',onOffline],['focus',onWake],['pagehide',onLeave],
      ['jackyun-local-durability',onEdit],['storage',onEdit],['jackyun-auth-recovered',onRetry],['jackyun-sync-retry',onRetry],['jackyun-sync-resolve',onResolve],['jackyun-sync-edit',onEdit],['jackyun-signout-start',onSignOut],
      ['jackyun-signout-cancel',onCancel],['jackyun-sync-before-signout',onBeforeSignOut],[BEFORE_SLEEP_EVENT,onSleep],[WAKE_EVENT,onWake]];
    for(const [name,listener]of listeners)window.addEventListener(name,listener);
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{window.removeEventListener('jackyun-sync-lane',onLane);for(const retry of recoveryTimers.values())clearTimeout(retry);channel?.close();window.removeEventListener('jackyun-local-durability',onDurable);cancelled=true;controller.abort();window.clearInterval(timer);editTrigger.dispose();
      for(const [name,listener]of listeners)window.removeEventListener(name,listener);document.removeEventListener('visibilitychange',onVisibility);};
  },[userId]);
  return <LocalDurabilityNotice/>;
}
