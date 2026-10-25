'use client';

import { BEFORE_SLEEP_EVENT, WAKE_EVENT, isWorkspaceSleeping, type SleepRequest } from '@/lib/workspace-idle';
import { fetchSyncWithTimeout } from '@/lib/request-timeout';
import {runScheduledSync} from '@/lib/sync/scheduler';
import {initializeRepository} from '@/lib/sync/repository';
import { useEffect, useState } from 'react';
import { bindOfflineWorkspaceUser, deferOfflineMutation, listOfflineMutations, submitOfflineOperation, blockOfflineMutation, offlineEntity, saveRemoteSnapshot,mutationScope } from '@/lib/offline/workspace';

export default function OfflineWorkspaceSync({ userId }: { userId: string | null }) {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let activeWork: Promise<void> = Promise.resolve();
    let bound = false;
    let signingOut = false;

    async function refresh(includeSnapshot=true,manual=false){if(userId)await runScheduledSync('business',userId,()=>refreshNow(includeSnapshot),manual);}
    async function refreshNow(includeSnapshot = true) {
      if (!userId || !bound || signingOut || cancelled || !navigator.onLine || running || isWorkspaceSleeping()) return false;
      running = true;
      try {
        const queued = await listOfflineMutations(userId);
        if (!includeSnapshot && !queued.some(operation => !operation.nextAttemptAt || Date.parse(operation.nextAttemptAt) <= Date.now())) return false;
        let deferred = false;
        const blocked=new Set(queued.filter(op=>op.blocked).map(offlineEntity));
        for (const operation of queued) {
          if(operation.blocked||blocked.has(offlineEntity(operation)))continue;
          if (operation.nextAttemptAt && Date.parse(operation.nextAttemptAt) > Date.now()){blocked.add(offlineEntity(operation));continue;}
          try {
            await submitOfflineOperation(operation);
          } catch (error) {
            const status=Number((error as {status?:number}).status??0);
            if(status>=400&&status<500&&![401,403,408,429].includes(status)){await blockOfflineMutation(operation);blocked.add(offlineEntity(operation));setNotice('一项操作需要检查，原内容保留；其他数据继续同步');continue;}
            await deferOfflineMutation(operation.id, '暂时未获云端确认');
            if (navigator.onLine) console.warn('[offline-workspace] retry deferred', error);
            deferred = true;
            throw error;
          }
        }
        if (deferred) return false;
        const remaining=await listOfflineMutations(userId);
        const protectedScopes=new Set(remaining.map(mutationScope));
        const scopes=(['tasks','review','reading'] as const).filter(scope=>!protectedScopes.has(scope));
        const snapshots=await Promise.allSettled(scopes.map(async scope=>{
          const response=await fetchSyncWithTimeout('/api/offline/workspace?scope='+scope,{cache:'no-store'});
          if(!response.ok)throw Object.assign(Error('业务快照暂时无法读取'),{status:response.status});
          const snapshot=await response.json() as Record<string,unknown>;
          if(!Object.hasOwn(snapshot,scope))throw Error('业务快照格式未确认。');
          if(cancelled||signingOut)return;
          await saveRemoteSnapshot(userId!,scope,snapshot[scope]);
        }));
        const failed=snapshots.find((result):result is PromiseRejectedResult=>result.status==='rejected');
        if(failed)throw failed.reason;
        if(remaining.length)return false;
        if (!cancelled && queued.length) {
          const remaining = await listOfflineMutations(userId);
          if (!remaining.length) setNotice(`已联网，${queued.length} 项离线操作已同步`);
        }
        return true;
      } catch (error) {
        if (navigator.onLine) console.warn('[offline-workspace] sync deferred');
        throw error;
      } finally {
        running = false;
      }
    }

    void initializeRepository(userId).then(()=>bindOfflineWorkspaceUser(userId)).then(() => { bound = true; activeWork = refresh().catch(()=>{}); return activeWork; }).catch((error) => {
      console.error('[offline-workspace] account binding failed', error);
    });
    const onSignOut = () => { signingOut = true; };
    const onCancel = () => { signingOut = false; };
    window.addEventListener('jackyun-signout-start', onSignOut);
    window.addEventListener('jackyun-signout-cancel', onCancel);
    let recoveryTimer:ReturnType<typeof setTimeout>|undefined;
    const onLane=(event:Event)=>{const lane=(event as CustomEvent<{userId:string;lane:string;state:string;nextAttemptAt:number;openUntil:number}>).detail;
      if(lane.userId!==userId||lane.lane!=='business')return;if(recoveryTimer)clearTimeout(recoveryTimer);
      if(lane.state==='waiting')recoveryTimer=setTimeout(()=>{if(!cancelled&&document.visibilityState==='visible')activeWork=refresh(false).catch(()=>{});},Math.max(100,Math.max(lane.nextAttemptAt,lane.openUntil)-Date.now()));
    };
    window.addEventListener('jackyun-sync-lane',onLane);
    const onRetry=()=>{if(!running)activeWork=refresh(true,true).catch(()=>{});};
    window.addEventListener('jackyun-auth-recovered',onRetry);window.addEventListener('jackyun-sync-retry',onRetry);
    const onOnline = () => { if (!running) activeWork = refresh().catch(()=>{}); };
    const retryTimer = window.setInterval(() => { if (navigator.onLine && !running && document.visibilityState==='visible') activeWork = refresh(false).catch(()=>{}); }, 30_000);
    const onSleep = (event: Event) => {
      (event as CustomEvent<SleepRequest>).detail.waitUntil(activeWork.then(() => refresh()));
    };
    window.addEventListener(BEFORE_SLEEP_EVENT, onSleep);
    window.addEventListener(WAKE_EVENT, onOnline);
    const onQueued = () => {setNotice('已记录，联网后同步');if(bound&&!running)activeWork=refresh(false).catch(()=>{});};
    window.addEventListener('online', onOnline);
    window.addEventListener('jackyun-offline-queued', onQueued);
    return () => {
      window.removeEventListener('jackyun-sync-lane',onLane);if(recoveryTimer)clearTimeout(recoveryTimer);
      window.removeEventListener(BEFORE_SLEEP_EVENT, onSleep);
      window.removeEventListener(WAKE_EVENT, onOnline);
      cancelled = true;
      window.removeEventListener('jackyun-signout-start', onSignOut);
      window.removeEventListener('jackyun-signout-cancel', onCancel);
      window.removeEventListener('jackyun-auth-recovered',onRetry);window.removeEventListener('jackyun-sync-retry',onRetry);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('jackyun-offline-queued', onQueued);
      window.clearInterval(retryTimer);
    };
  }, [userId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  return <div role="status" className="fixed bottom-5 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-[#202124] px-4 py-2.5 text-sm font-semibold text-white shadow-2xl">{notice}</div>;
}
