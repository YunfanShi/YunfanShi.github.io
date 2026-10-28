import { accountSyncStore, withSyncLease } from './outbox.ts';
import { isSyncPaused } from './pause.ts';
export type SyncLane='workspace'|'business'|'backup';
interface Recovery {failures:number;nextAttemptAt:number;openUntil:number;authPaused?:boolean;lastSuccessAt?:string;}
export interface LaneState extends Recovery {lane:SyncLane;userId:string;state:'syncing'|'confirmed'|'waiting'|'auth_required';}
const latest=new Map<string,LaneState>();
export const getLatestLaneStates=()=>[...latest.values()];
function announce(lane:SyncLane,userId:string,recovery:Recovery,state:LaneState['state']){
  const detail={...recovery,lane,userId,state};latest.set(userId+':'+lane,detail);
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('jackyun-sync-lane',{detail}));
}
const running=new Set<string>();
export function retryAfterMilliseconds(value:string|null,now=Date.now()):number {
  if(!value)return 0;const seconds=Number(value);return Math.max(0,Number.isFinite(seconds)?seconds*1000:Date.parse(value)-now)||0;
}
export function recoveryDelay(failures:number,random=Math.random()):number {
  return Math.round(Math.min(120_000,2_000*2**Math.min(Math.max(0,failures-1),6))*(0.5+0.5*random));
}
export async function runScheduledSync(lane:SyncLane,userId:string,work:()=>Promise<void|boolean>,manual=false):Promise<boolean> {
  // A pause is device-local and covers every scheduled lane. Explicit user retries
  // remain available, while local edits and queued operations stay untouched.
  if(!manual&&isSyncPaused(userId))return false;
  const {getSetting,setSetting}=accountSyncStore(userId);
  const key=`recovery:${userId}:${lane}`;
  if(running.has(key))return false;running.add(key);
  try{
    const execute=async()=>{
      const state=await getSetting<Recovery>(key)??{failures:0,nextAttemptAt:0,openUntil:0};
      if(!manual&&(state.authPaused||Date.now()<state.nextAttemptAt||Date.now()<state.openUntil)){announce(lane,userId,state,state.authPaused?'auth_required':'waiting');return false;}
      // A manual attempt is one half-open probe under the same cross-tab lease.
      announce(lane,userId,state,'syncing');
      try{
        const performed=await work();
        if(performed===false){announce(lane,userId,{...state,nextAttemptAt:Date.now()+30_000},state.authPaused?'auth_required':'waiting');return false;}
        const confirmed={failures:0,nextAttemptAt:0,openUntil:0,lastSuccessAt:new Date().toISOString()};await setSetting(key,confirmed);announce(lane,userId,confirmed,'confirmed');return true;}
      catch(error){
        const status=error&&typeof error==='object'&&'status'in error?Number(error.status):0;
        const retryAfter=error&&typeof error==='object'&&'retryAfterMs'in error?Number(error.retryAfterMs)||0:0;
        const failures=state.failures+1;
        const failed={...state,failures,authPaused:status===401||status===403||status===426,
          nextAttemptAt:Date.now()+Math.max(recoveryDelay(failures),retryAfter),openUntil:failures>=5?Date.now()+30_000:0};
        await setSetting(key,failed);announce(lane,userId,failed,failed.authPaused?'auth_required':'waiting');
        throw error;
      }
    };
    let result=false;
    if(navigator.locks)await navigator.locks.request(`jackyun:sync:${userId}:${lane}`,{ifAvailable:true},async lock=>{if(lock)result=await execute();});
    else await withSyncLease(key,async()=>{result=await execute();},`jackyun-sync-v2:${userId}`);
    return result;
  }finally{running.delete(key);}
}

/** One trailing debounce with a maximum wait avoids starving sustained edits. */
export function createEditTrigger(run:()=>void,now=Date.now) {
  let timer:ReturnType<typeof setTimeout>|undefined,first:number|undefined;
  return {trigger(){first??=now();if(timer)clearTimeout(timer);timer=setTimeout(()=>{timer=undefined;first=undefined;run();},Math.max(0,Math.min(1000,5000-(now()-first))));},
    dispose(){if(timer)clearTimeout(timer);first=undefined;}};
}
