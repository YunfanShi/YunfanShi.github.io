'use client';

import {useEffect,useRef} from 'react';
import {usePathname} from 'next/navigation';
import {fetchAuthenticatedSync as fetchSyncWithTimeout} from '@/lib/sync/session-transport';
import {shouldPauseSync} from '@/lib/sync/retry-policy';
import {runScheduledSync,createEditTrigger} from '@/lib/sync/scheduler';
import {workspaceStorage,initializeRepository,flushLocalWrites,applyRepositoryRecord,projectCommittedRepositoryRecord,projectLegacyCloudBaseline,setV5ScheduleAuthority,setV5WorkspaceAuthorityKeys} from '@/lib/sync/repository';
import {BEFORE_SLEEP_EVENT,LOCAL_SLEEP_SAVE_EVENT,WAKE_EVENT,isWorkspaceSleeping,type SleepRequest} from '@/lib/workspace-idle';
import {createSyncRunGate} from '@/lib/sync/run-gate';
import {runConflictBatch,type ConflictBatch} from '@/lib/sync/conflict-batch';
import {announceSyncStatus as announce,getLatestSyncStatus} from '@/lib/sync/status';
import {CLOUD_STATE_APPLIED_EVENT,MAX_SYNC_VALUE_CHARACTERS,isSyncableStorageKey} from '@/lib/local-workspace';
import * as syncStore from '@/lib/sync/outbox';
import {archiveV5CoveredLegacyConflicts,getConflicts,getSetting,getV5Conflicts,getV5Outbox,getV5Resources,migrateLegacyConflictToV5} from '@/lib/sync/outbox';
import {createWorkspaceSync} from '@/lib/sync/engine';
import {createV5ResourceSync,resourceFieldsForPath,retainV5ScheduleAuthority} from '@/lib/sync/resource-engine';
import {allV5ResourceTargets,legacyWorkspaceRecordId,SYNC_V5_SCOPES,SYNC_V5_SCHEDULE_SCOPES} from '@/lib/sync/resource-model';
import {canonicalJson} from '@/lib/sync/hash';
import {isBackupableLegacyKey,legacyBackupPage,type BackupPage} from '@/lib/backup/pages';
import {localPageValues,saveLocalBackup} from '@/lib/backup/local';
import {backupIsDue,recordBackupChange,type PendingBackup} from '@/lib/backup/cadence';
import {createDueBackupVersions} from '@/actions/backup-center';
import {emitDiagnostic,errorDetails} from '@/lib/diagnostic-events';
import {syncFailureStatus} from '@/lib/sync/service-error';
import {reportSyncFailure} from '@/lib/sync/report-failure';
import type {SyncStatus,SyncResolutionRequest} from '@/types/sync';

async function runScheduledBackup(userId: string): Promise<boolean> {
  return runScheduledSync('backup', userId, async () => {
    const attempt = await createDueBackupVersions();
    if (!attempt.ok) {
      throw Object.assign(new Error('自动备份暂未完成，稍后会重试。'), attempt.status ? { status: attempt.status } : {});
    }
    return true;
  });
}

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

function WorkspaceRouteSyncTrigger() {
  const pathname=usePathname();
  const lastRoutePathname=useRef(pathname);
  useEffect(()=>{
    if(!pathname||pathname===lastRoutePathname.current)return;
    lastRoutePathname.current=pathname;
    window.dispatchEvent(new CustomEvent('jackyun-sync-page-change',{detail:{pathname}}));
  },[pathname]);
  return null;
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
      const [pending,conflicts,lastSyncedAt,v5Pending,v5Conflicts,restoreTargets]=await Promise.all([accountStore.getOutbox(),accountStore.getConflicts(),accountStore.getSetting<string>('lastSyncedAt'),v5Authority?getV5Outbox(undefined,accountStore.databaseScope):Promise.resolve([]),v5Authority?getV5Conflicts(accountStore.databaseScope):Promise.resolve([]),syncStore.getV5RestoreTargets(accountStore.databaseScope)]);
      if(cancelled) return;
      const totalPending=pending.length+v5Pending.length+restoreTargets.length,totalConflicts=conflicts.length+v5Conflicts.length;
      announce({state:totalConflicts && state!=='syncing' && state!=='error' && state!=='server_unavailable' && state!=='auth_required' && state!=='access_denied' ? 'conflict' : state==='synced' && totalPending ? 'offline_pending' : state,
        pending:totalPending,conflicts:totalConflicts,lastSyncedAt,error,progress:progress??(v5Conflicts.length?'存在 v5 资源冲突，本机与云端内容均已保留，请在同步诊断中查看。':undefined),consecutiveFailures:failures});
    };
    let requestReason='periodic';
    let v5Enabled=false,v5Authority=false,v5AuthoritySuspended=false,v5WorkspaceKeys=new Set<string>();
    const storedV5Authority=Promise.all([accountStore.getSetting<boolean>('v5ScheduleAuthority'),accountStore.getSetting<string[]>('v5WorkspaceAuthorityKeys')]).then(([enabled,keys])=>{
      if(enabled){setV5ScheduleAuthority(SYNC_V5_SCHEDULE_SCOPES);v5Enabled=true;v5Authority=true;}
      v5WorkspaceKeys=new Set(Array.isArray(keys)?keys:[]);setV5WorkspaceAuthorityKeys([...v5WorkspaceKeys]);return Boolean(enabled);
    });
    const engine=createWorkspaceSync({store:accountStore,snapshot:()=>localSnapshot(true),read:key=>workspaceStorage.getItem(key),
      write:async(key,value,expected)=>{if(cancelled||signingOut)throw new DOMException('Sync cancelled','AbortError');await applyRepositoryRecord(key,value,expected);},
      backup:async key=>{if(isBackupableLegacyKey(key))await saveLocalBackup(userId,legacyBackupPage(key),localPageValues(localSnapshot(true),legacyBackupPage(key)));},
      changed:keys=>window.dispatchEvent(new CustomEvent(CLOUD_STATE_APPLIED_EVENT,{detail:{keys,source:'cloud'}})),
      request:(url,init)=>fetchSyncWithTimeout(url,{...init,headers:{...init?.headers,'X-Sync-Reason':requestReason,'X-Sync-Account':userId},signal:controller.signal},false),
      progress:progress=>{if(!cancelled){const current=getLatestSyncStatus();announce({...current??{state:'syncing',pending:0,conflicts:0,lastSyncedAt:null},progress});}},
      usesV5Schedule:()=>v5Authority,
      usesV5WorkspaceKey:key=>v5WorkspaceKeys.has(key),
      projectLegacyBaseline:(key,value,expected)=>{if(cancelled||signingOut)throw new DOMException('Sync cancelled','AbortError');return projectLegacyCloudBaseline(key,value,expected);},
      deviceId:accountStore.getOrCreateDeviceId,device:deviceDescription,cancelled:()=>cancelled||signingOut||syncStore.isSyncLeaseLost?.(`recovery:${userId}:workspace`)===true,now:Date.now,uuid:()=>crypto.randomUUID(),
    });
    const v5Sync=createV5ResourceSync({request:(url,init)=>fetchSyncWithTimeout(url,{...init,headers:{...init?.headers,'X-Sync-Reason':requestReason,'X-Sync-Account':userId},signal:controller.signal},false),deviceId:accountStore.getOrCreateDeviceId,
      readSchedule:()=>workspaceStorage.getItem('jackyun_schedule_control_v1'),projectSchedule:value=>{if(cancelled||signingOut)throw new DOMException('Sync cancelled','AbortError');return projectCommittedRepositoryRecord('jackyun_schedule_control_v1',value);},
      readWorkspace:()=>syncStore.getDocuments(accountStore.databaseScope),flushLocalWrites,projectWorkspaceRecord:(key,value)=>{if(cancelled||signingOut)throw new DOMException('Sync cancelled','AbortError');return projectCommittedRepositoryRecord(key,value);},
      setAuthority:async scopes=>{
        if(cancelled||signingOut)return;
        v5Enabled=scopes.length>0;
        if(retainV5ScheduleAuthority(v5Authority,scopes)){v5AuthoritySuspended=true;return;}
        v5AuthoritySuspended=false;setV5ScheduleAuthority(scopes);v5Authority=SYNC_V5_SCHEDULE_SCOPES.every(scope=>scopes.includes(scope));
        await accountStore.setSetting('v5ScheduleAuthority',v5Authority);
      },
      setWorkspaceAuthorityKeys:async keys=>{if(cancelled||signingOut)return;v5WorkspaceKeys=new Set(keys);setV5WorkspaceAuthorityKeys(keys);await accountStore.setSetting('v5WorkspaceAuthorityKeys',[...new Set(keys)].sort());},
      databaseScope:accountStore.databaseScope,isCurrent:()=>!cancelled&&!signingOut,uuid:()=>crypto.randomUUID()});
    let queuedResolution: SyncResolutionRequest | undefined;
    let queuedV5Resolution:{operationId:string;choice:'local'|'remote'}|undefined;
    let v5ReconcileRequested=false;
    const queuedBatches:ConflictBatch[]=[];
    let activePathname=window.location.pathname,queuedRouteSync=false,routeRetryDelay=1_000;
    let routeRetryTimer:number|undefined;
    const scheduleRouteRetry=()=>{
      if(routeRetryTimer||cancelled||signingOut||!queuedRouteSync||!navigator.onLine||document.visibilityState!=='visible'||isWorkspaceSleeping())return;
      const delay=routeRetryDelay;routeRetryDelay=Math.min(30_000,routeRetryDelay*2);
      routeRetryTimer=window.setTimeout(()=>{
        routeRetryTimer=undefined;
        if(!cancelled&&!signingOut&&queuedRouteSync)void sync(false,false,undefined,'route');
      },delay);
    };
    async function sync(manual=false,allowHidden=false,resolution?:SyncResolutionRequest,reason=manual?'manual':'periodic') {
      if(cancelled||signingOut)return;
      if(reason==='route')queuedRouteSync=true;
      if(!bound||isWorkspaceSleeping())return;
      if(!manual&&!allowHidden&&document.visibilityState!=='visible'){await engine.capture();return;}
      if(resolution){queuedResolution=resolution;v5ReconcileRequested=true;}
      if(!gate.begin(manual)){if(reason==='route')queuedRouteSync=true;return;}
      const routeForRun=activePathname;
      requestReason=reason;
      if(manual){authPaused=false;}
      try {
        const work=async()=>{
          if(cancelled||signingOut)return false;
          try{await flushLocalWrites();}catch{/* Only the verified cloud replacement below may retire a legacy failure. */}
          if(queuedBatches.length){
            const batch=queuedBatches.shift()!;
            if(batch.legacy.length)v5ReconcileRequested=true;
            const result=await runConflictBatch({...batch,legacy:[]},async()=>{},
              (conflict,choice)=>v5Sync.resolveConflict(conflict.operationId,choice,conflict));
            if(result.failures.length)throw Error(`已处理 ${result.completed} 项，${result.failures.length} 项未完成并保留：${result.failures[0].message}`);
          }
          await flushLocalWrites();await engine.capture();
          if(!navigator.onLine){await publish('offline_pending');return false;}
          if(authPaused)return false;
          const [pending,conflicts,lastRead,v5Pending,queuedRestoreTargets]=await Promise.all([accountStore.getOutbox(),accountStore.getConflicts(),accountStore.getSetting<number>('lastAutomaticPull'),v5Enabled?getV5Outbox(undefined,accountStore.databaseScope):Promise.resolve([]),syncStore.getV5RestoreTargets(accountStore.databaseScope)]);
          const blocked=new Set(conflicts.map(c=>c.key));
          if(!manual&&!queuedResolution&&!v5ReconcileRequested&&!pending.some(op=>!blocked.has(op.key))&&!v5Pending.length&&!queuedRestoreTargets.length&&requestReason!=='edit'&&requestReason!=='route'&&Date.now()-(lastRead??0)<30_000){await publish('synced');return false;}
          await publish('syncing',undefined,'正在核对云端版本，本机原始数据会保留…');
          if(queuedResolution)queuedResolution=undefined;
          if(queuedV5Resolution){const choice=queuedV5Resolution;await v5Sync.resolveConflict(choice.operationId,choice.choice);if(queuedV5Resolution===choice)queuedV5Resolution=undefined;}
          const restoreTargets=await syncStore.getV5RestoreTargets(accountStore.databaseScope);
          const bootstrapComplete=await accountStore.getSetting<boolean>('v5FullBootstrapComplete')===true;
          const fullTargets=allV5ResourceTargets();
          const fullV5Run=reason==='v5-refresh'||v5ReconcileRequested||!bootstrapComplete;
          const requestedTargets=bootstrapComplete&&!fullV5Run?[...resourceFieldsForPath(routeForRun),...restoreTargets]:fullTargets;
          const v5Result=await v5Sync.synchronize(requestedTargets,{resetCursors:reason==='v5-refresh',requireAllTargets:fullV5Run});
          v5Enabled=v5Result.enabled;
          if(!v5Result.enabled)throw Object.assign(Error('V5 云端同步暂不可用，本机数据与待上传队列已保留。'),{status:503,code:'SYNC_V5_UNAVAILABLE'});
          const fullScopeSet=SYNC_V5_SCOPES.every(scope=>v5Result.scopes?.includes(scope));
          const fullTargetSet=fullTargets.filter(target=>v5Result.writingCollectionsEnabled||!['writingEssays','writingErrorHistory','writingArchive'].includes(target.field))
            .every(target=>v5Result.processedTargets?.some(row=>row.scope===target.scope&&row.field===target.field));
          if(fullV5Run&&fullScopeSet&&fullTargetSet){
            await accountStore.setSetting('v5FullBootstrapComplete',true);
            const [legacyConflicts,workspaceResources]=await Promise.all([getConflicts(accountStore.databaseScope),getV5Resources('workspace',accountStore.databaseScope)]);
            const remoteById=new Map(workspaceResources.filter(row=>row.verifiedAt||row.deleted).map(row=>[row.recordId,row]));
            const covered=legacyConflicts.filter(conflict=>{
              const recordId=legacyWorkspaceRecordId(conflict.key),remote=recordId?remoteById.get(recordId):undefined;
              const raw=workspaceStorage.getItem(conflict.key);let local:unknown=raw;
              if(raw!==null){try{local=JSON.parse(raw);}catch{/* Workspace string value. */}}
              const unchanged=canonicalJson(local)===canonicalJson(conflict.localValue)&&(raw===null)===conflict.localDeleted;
              const sameNull=local===null&&conflict.localValue===null&&conflict.remoteValue===null&&(!remote||remote.deleted||remote.value===null);
              return Boolean(unchanged&&((remote&&remote.deleted===conflict.localDeleted
                &&(remote.deleted||canonicalJson(remote.value)===canonicalJson(conflict.localValue)))||sameNull));
            });
            if(covered.length)await archiveV5CoveredLegacyConflicts(covered,accountStore.databaseScope);
            const stillLegacy=new Set((await getConflicts(accountStore.databaseScope)).map(conflict=>conflict.operationId));
            const coveredIds=new Set(covered.map(conflict=>conflict.operationId).filter(id=>!stillLegacy.has(id)));
            for(const conflict of legacyConflicts){
              if(coveredIds.has(conflict.operationId))continue;
              const recordId=legacyWorkspaceRecordId(conflict.key);if(!recordId)continue;
              const field=recordId.slice(0,recordId.indexOf(':'));
              if(['writingEssays','writingErrorHistory','writingArchive'].includes(field))continue;
              const raw=workspaceStorage.getItem(conflict.key);let local:unknown=raw;
              if(raw!==null){try{local=JSON.parse(raw);}catch{/* Workspace string value. */}}
              if(canonicalJson(local)!==canonicalJson(conflict.localValue)||(raw===null)!==conflict.localDeleted)continue;
              const remote=remoteById.get(recordId),deleted=raw===null;
              const operation={id:crypto.randomUUID(),scope:'workspace' as const,recordId,baseRevision:remote?.revision??0,baseHash:remote?.contentHash??null,
                value:local,deleted,clientUpdatedAt:new Date().toISOString()};
              await migrateLegacyConflictToV5(conflict,operation,accountStore.databaseScope);
            }
            await v5Sync.flushPending();
            v5ReconcileRequested=false;
            queuedResolution=undefined;
          }
          if(v5Result.enabled&&v5Result.processedTargets?.length)await syncStore.acknowledgeV5RestoreTargets(v5Result.processedTargets,accountStore.databaseScope);
          await flushLocalWrites();await engine.capture();
          await accountStore.setSetting('lastAutomaticPull',Date.now());
          const [remaining,unresolved,v5Remaining,v5Unresolved,remainingRestoreTargets]=await Promise.all([accountStore.getOutbox(),accountStore.getConflicts(),v5Enabled?getV5Outbox(undefined,accountStore.databaseScope):Promise.resolve([]),v5Enabled?getV5Conflicts(accountStore.databaseScope):Promise.resolve([]),syncStore.getV5RestoreTargets(accountStore.databaseScope)]);
          if(!remaining.length&&!unresolved.length&&!v5Remaining.length&&!v5Unresolved.length&&!remainingRestoreTargets.length)await accountStore.setSetting('lastSyncedAt',new Date().toISOString());
          failures=0;
          if(Date.now()-lastBackupCheck>=5*60_000){lastBackupCheck=Date.now();void runScheduledBackup(userId!).catch(()=>console.warn('[Backup] Cloud backup deferred'));}
          await publish(v5AuthoritySuspended?'server_unavailable':unresolved.length||v5Unresolved.length?'conflict':remaining.length||v5Remaining.length||remainingRestoreTargets.length?'offline_pending':'synced',undefined,
            v5AuthoritySuspended?'v5 Schedule 权限暂时不可用；为避免旧快照覆盖，已保留本地 v5 所有权并暂停该域回退。':unresolved.length?'存在不能安全合并的修改，两份内容已保留，请到设置的同步中心处理。':v5Unresolved.length?'存在 v5 资源冲突，本机与云端内容均已保留，请在同步诊断中查看。':remainingRestoreTargets.length?'本机数据已保存；相关 v5 资源尚待云端核对，恢复目标已保留并会继续重试。':remaining.length||v5Remaining.length?'本机修改仍在队列中，将分批继续上传。':v5Result.enabled&&resourceFieldsForPath(routeForRun).length?'当前页面所需资源已核对；其他页面会在打开时分别检查。':'V5 同步检查已完成。');
          return true;
        };
        const completed=await runScheduledSync('workspace',userId!,work,manual);
        if(completed&&activePathname===routeForRun){queuedRouteSync=false;routeRetryDelay=1_000;if(routeRetryTimer){window.clearTimeout(routeRetryTimer);routeRetryTimer=undefined;}}
        else if(!completed&&queuedRouteSync)scheduleRouteRetry();
      } catch(error) {
        if(cancelled||signingOut)return;
        if(error instanceof Error && error.name==='SyncReviewChangedError') {
          queuedResolution=undefined;
          await publish('conflict',undefined,error.message);return;
        }
        failures++;
        authPaused=shouldPauseSync(error)||(error as {status?:number}).status===426;
        emitDiagnostic('error','WorkspaceSync','同步未确认，原始内容与待上传修改保留',{error:errorDetails(error),failures,online:navigator.onLine});
        const status=syncFailureStatus(error,navigator.onLine,failures);
        if(status==='server_unavailable'||status==='offline_pending'){
          await publish(status,undefined,'本机已保存，网络恢复后自动同步。');
        }else{
          void reportSyncFailure(error,'cycle');
          await publish(status,error instanceof Error?error.message:'同步需要处理');
        }
      } finally {
        const manualQueued=gate.finish();
        if(!cancelled&&!signingOut){
          if(manualQueued){queuedRouteSync=false;void sync(true);}
          else if(queuedRouteSync&&!routeRetryTimer){queuedRouteSync=false;void sync(false,false,undefined,'route');}
        }
      }
    }
    workspaceStorage.removeItem('jackyun_guest_mode');
    void publish('syncing',undefined,'正在初始化 V5 同步…');
    const initialize=()=>initializeRepository(userId).then(async()=>{v5Authority=await storedV5Authority;bound=true;
      // Let pages hydrate and paint the restored IndexedDB projection before the first cloud request.
      await new Promise<void>(resolve=>window.setTimeout(resolve,50));if(cancelled)return;
      return sync(false,false,undefined,queuedRouteSync?'route':'periodic');}).catch(error=>{
      emitDiagnostic('error','WorkspaceSync','同步初始化失败，本机数据保留',{error:errorDetails(error),online:navigator.onLine});
      const status=syncFailureStatus(error,navigator.onLine,1);
      if(status==='server_unavailable'||status==='offline_pending')void publish(status,undefined,'本机已保存，网络恢复后自动同步。');
      else{void reportSyncFailure(error,'initialization');void publish('error',error instanceof Error?error.message:'账号初始化需要处理');}
    });
    void initialize();
    const editTrigger=createEditTrigger(()=>{void sync(false,false,undefined,'edit');});
    const onEdit=()=>editTrigger.trigger();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible'){if(!bound)void initialize();else void sync(false,false,undefined,queuedRouteSync?'route':'periodic');}},30_000);
    const recoveryTimers=new Map<string,ReturnType<typeof setTimeout>>();
    const onLane=(event:Event)=>{
      const lane=(event as CustomEvent<{userId:string;lane:string;state:string;nextAttemptAt:number;openUntil:number}>).detail;
      if(lane.userId!==userId||!['workspace','backup'].includes(lane.lane))return;
      if(lane.lane==='workspace'&&lane.state==='auth_required'){
        void publish('auth_required','同步等待登录或权限恢复，可点击立即同步重新核对；本机队列保留。');
        return;
      }
      const previous=recoveryTimers.get(lane.lane);if(previous)clearTimeout(previous);
      if(lane.state!=='waiting')return;
      recoveryTimers.set(lane.lane,setTimeout(()=>{
        if(cancelled||signingOut||document.visibilityState!=='visible'||isWorkspaceSleeping())return;
        if(lane.lane==='workspace')void sync(false,false,undefined,queuedRouteSync?'route':'periodic');
        else void runScheduledBackup(userId!).catch(()=>{});
      },Math.max(100,Math.max(lane.nextAttemptAt,lane.openUntil)-Date.now())));
    };
    window.addEventListener('jackyun-sync-lane',onLane);
    const onOnline=()=>{if(routeRetryTimer){window.clearTimeout(routeRetryTimer);routeRetryTimer=undefined;}if(!bound)void initialize();else void sync(false,false,undefined,queuedRouteSync?'route':'online');};
    const onWake=()=>void sync(false,false,undefined,queuedRouteSync?'route':'resume');
    const onOffline=()=>void publish('offline_pending');
    const onRetry=()=>void sync(true);
    const onV5Refresh=()=>void sync(true,false,undefined,'v5-refresh');
    const onRouteChange=(event:Event)=>{
      const next=(event as CustomEvent<{pathname?:unknown}>).detail?.pathname;
      if(typeof next!=='string'||!next||next===activePathname)return;
      activePathname=next;
      void sync(false,false,undefined,'route');
    };
    const onResolve=(event:Event)=>{const detail=(event as CustomEvent<SyncResolutionRequest>).detail;if(detail?.operationId&&['local','remote','merged'].includes(detail.choice))void sync(true,false,detail);};
    const onResolveV5=(event:Event)=>{const detail=(event as CustomEvent<{operationId:string;choice:'local'|'remote'}>).detail;if(detail?.operationId&&['local','remote'].includes(detail.choice)){queuedV5Resolution=detail;void sync(true);}};
    const onResolveBatch=(event:Event)=>{const batch=(event as CustomEvent<ConflictBatch>).detail;
      if(batch?.id&&Array.isArray(batch.legacy)&&Array.isArray(batch.resources)&&!queuedBatches.some(row=>row.id===batch.id)){queuedBatches.push(batch);void sync(true);}};
    const onVisibility=()=>{if(document.visibilityState==='visible')void sync(false,false,undefined,queuedRouteSync?'route':'periodic');else void engine.capture();};
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
      ['jackyun-local-durability',onEdit],['storage',onEdit],['jackyun-auth-recovered',onRetry],['jackyun-sync-retry',onRetry],['jackyun-sync-v5-refresh',onV5Refresh],['jackyun-sync-resolve',onResolve],['jackyun-sync-v5-resolve',onResolveV5],['jackyun-sync-resolve-batch',onResolveBatch],['jackyun-sync-edit',onEdit],['jackyun-sync-page-change',onRouteChange],['jackyun-signout-start',onSignOut],
      ['jackyun-signout-cancel',onCancel],['jackyun-sync-before-signout',onBeforeSignOut],[BEFORE_SLEEP_EVENT,onSleep],[WAKE_EVENT,onWake]];
    for(const [name,listener]of listeners)window.addEventListener(name,listener);
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{window.removeEventListener('jackyun-sync-lane',onLane);for(const retry of recoveryTimers.values())clearTimeout(retry);if(routeRetryTimer)window.clearTimeout(routeRetryTimer);channel?.close();window.removeEventListener('jackyun-local-durability',onDurable);cancelled=true;controller.abort();window.clearInterval(timer);editTrigger.dispose();
      for(const [name,listener]of listeners)window.removeEventListener(name,listener);document.removeEventListener('visibilitychange',onVisibility);};
  },[userId]);
  return <>{userId&&<WorkspaceRouteSyncTrigger/>}</>;
}
