'use client';
import { workspaceStorage } from '@/lib/sync/repository';

import { useEffect, useRef, useState } from 'react';
import { readScheduleState, SCHEDULE_STORAGE_KEY } from '@/lib/learning/workspace-reader';
import { applyPracticeSession, mergePracticeSession, PracticeSessionConflict, validateSession, validateConfig, type PracticeSession, type PracticeConfig } from '@/lib/learning/practice-timer';
import { threeWayMerge } from '@/lib/sync/merge';
import { createLocalEditWriter, parseLocalValue } from '@/lib/sync/local-edit';
import { CLOUD_STATE_APPLIED_EVENT } from '@/lib/local-workspace';
import type { ScheduleControlState } from '@/lib/learning/schedule-control';
import logger from '@/lib/logger';
import { errorDetails } from '@/lib/diagnostic-events';

export default function PracticeTimerFrame() {
  const ref = useRef<HTMLIFrameElement>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') ref.current?.contentWindow?.postMessage({type:'practice-exit-focus'}, location.origin); };
    window.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', escape); };
  }, [focused]);
  useEffect(() => {
    const writer = createLocalEditWriter(workspaceStorage, SCHEDULE_STORAGE_KEY, navigator.locks ? async (name, work) => navigator.locks.request(name, work) : undefined);
    let legacyCuesNoticeLogged=false;
    const readTimerSchedule = (stage:string) => {
      const raw=workspaceStorage.getItem(SCHEDULE_STORAGE_KEY);
      try {
        const value=readScheduleState(workspaceStorage);
        if(raw!==null){
          let parsed:unknown;try{parsed=JSON.parse(raw);}catch{parsed=undefined;}
          if(!legacyCuesNoticeLogged&&parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&!Object.hasOwn(parsed,'cues')){
            logger.warn('PracticeTimer','Schedule 快照缺少 cues 字段，已按旧格式读取',{stage,key:SCHEDULE_STORAGE_KEY,rawLength:raw.length,schemaVersion:(parsed as {schemaVersion?:unknown}).schemaVersion});
            legacyCuesNoticeLogged=true;
          }
        }
        return value;
      } catch(error) {
        let parsed:unknown;try{parsed=raw===null?undefined:JSON.parse(raw);}catch{parsed=undefined;}
        const record=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:undefined;
        logger.error('PracticeTimer','读取 Schedule 数据失败',{stage,key:SCHEDULE_STORAGE_KEY,rawPresent:raw!==null,rawLength:raw?.length??0,
          schemaVersion:record?.schemaVersion??null,cuesType:record&&Object.hasOwn(record,'cues')?Array.isArray(record.cues)?'array':record.cues===null?'null':typeof record.cues:'missing',error:errorDetails(error)});
        throw error;
      }
    };
    const readRecoveredState = () => {
      let state = readTimerSchedule('recovery');
      for (let i = 0; i < workspaceStorage.length; i++) {
        const key = workspaceStorage.key(i);
        if (!key?.startsWith('jackyun_debug_unsaved_edit:practice-timer:')) continue;
        try {
          const saved = JSON.parse(workspaceStorage.getItem(key) || 'null');
          const session = validateSession(saved?.session);
          const current = state.practiceSessions?.find(item => item.id === session.id);
          if (!current || session.updatedAt >= current.updatedAt) {
            state = applyPracticeSession(state, session);
            if (saved.config) state = { ...state, practiceTimerConfig: validateConfig(saved.config) };
          }
        } catch { /* Keep unreadable checkpoints for manual recovery. */ }
      }
      return state;
    };
    const send = (data: unknown) => ref.current?.contentWindow?.postMessage(data, location.origin);
    let queue = Promise.resolve();
    let liveRetryAt = 0;
    const sessionBases = new Map<string, PracticeSession>();
    const conflictedSessions = new Set<string>();
    let configBase: PracticeConfig | undefined;
    let initialization: Promise<void> | undefined;
    const initialize = () => {
      if (initialization) return initialization;
      initialization = (async () => {
        try {
          let state = readTimerSchedule('initialize'), base = parseLocalValue(workspaceStorage.getItem(SCHEDULE_STORAGE_KEY)), migrated = false;
          const recoveryKeys = Array.from({length: workspaceStorage.length}, (_, index) => workspaceStorage.key(index))
            .filter((key): key is string => Boolean(key?.startsWith('jackyun_debug_unsaved_edit:practice-timer:')));
          for (const key of recoveryKeys) {
            try {
              const saved = JSON.parse(workspaceStorage.getItem(key) || 'null'), session = validateSession(saved?.session);
              if (saved?.conflict === true) continue;
              if (!session.finished) continue;
              const next = applyPracticeSession(state, session);
              if (JSON.stringify(next.practiceSessions) !== JSON.stringify(state.practiceSessions)) {
                writer.reset(base);
                await writer.write(base, next);
                state = next;
                base = next;
                migrated = true;
              }
              if (saved.config && JSON.stringify(saved.config) !== JSON.stringify(state.practiceTimerConfig)) continue;
              workspaceStorage.removeItem(key);
            } catch { /* Preserve checkpoints that conflict with newer canonical progress. */ }
          }
          if (migrated) window.dispatchEvent(new Event('jackyun-sync-edit'));
          state = readRecoveredState();
          for (const session of state.practiceSessions ?? []) sessionBases.set(session.id, session);
          configBase = state.practiceTimerConfig;
          send({ type: 'practice-state', state, requestedSession: new URLSearchParams(location.search).get('session') });
        } catch (error) { send({ type: 'practice-error', error: String(error) }); }
      })().finally(() => { initialization = undefined; });
      return initialization;
    };
    const handler = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== ref.current?.contentWindow) return;
      const message = event.data;
      if (message?.type === 'practice-focus') { setFocused(message.focused === true); return; }
      if (message?.type === 'practice-ready') {
        void initialize();
      }
      if (message?.type !== 'practice-save' && message?.type !== 'practice-retest') return;
      queue = queue.catch(()=>{}).then(async () => {
        try {
          if (message.session && conflictedSessions.has(message.session.id)) {
            const recovery=validateSession(message.session);
            workspaceStorage.setItem('jackyun_debug_unsaved_edit:practice-timer:'+recovery.id,JSON.stringify({session:recovery,config:message.config,conflict:true}));
            send({type:'practice-saved',requestId:message.requestId,sessionId:recovery.id,localOnly:true,conflictPending:true});
            return;
          }
          const base = parseLocalValue(workspaceStorage.getItem(SCHEDULE_STORAGE_KEY));
          const state = readTimerSchedule(message.type);
          let next: ScheduleControlState = state;
          if (message.type === 'practice-retest') {
            const session = state.practiceSessions?.find(s=>s.id===message.sessionId && s.finished);
            if (!session) throw Error('请先保存训练报告。');
            const id = `practice-retest-${session.id}`;
            if (!state.manualTasks.some(t=>t.id===id)) next = { ...state, manualTasks: [...state.manualTasks, { id, date: session.date, type: 'practice', subject: session.subject, durationMinutes: 20, title: `新题复测 · ${session.subject}`, note: `先修主要卡点，再换未见题独立计时。范围：${session.scope || '本次薄弱题型'}。原始结果保留。`, scope: {cueIds:[],questionIds:[]}, guide:{tab:'practice',subTab:'stuck'} }] };
          } else {
            if (message.session) {
              if (message.controllerId) {
                let live;
                try {
                  if (Date.now() < liveRetryAt) throw Error('Cloud retry pending');
                  const response = await fetch('/api/practice-timer/live?status=1', { cache:'no-store', signal:AbortSignal.timeout(4000) });
                  if (!response.ok) throw Error('Cloud unavailable');
                  live = await response.json();
                  if (!live?.ownerId) throw Error('Ownership not confirmed');
                  liveRetryAt = 0;
                } catch {
                  if (Date.now() >= liveRetryAt) liveRetryAt = Date.now() + 10000;
                  const recovery = validateSession(message.session);
                  workspaceStorage.setItem('jackyun_debug_unsaved_edit:practice-timer:' + recovery.id, JSON.stringify({session:recovery,config:message.config}));
                  if (recovery.finished) {
                    next = applyPracticeSession(state, recovery);
                    if (message.config) {
                      const local = validateConfig(message.config), merged = threeWayMerge(configBase, local, state.practiceTimerConfig);
                      if (merged.conflicts.length) throw Error('另一设备修改了相同时间设置，请重新打开页面；练习结果已保留在本机。');
                      next = { ...next, practiceTimerConfig: validateConfig(merged.merged) };
                    }
                    writer.reset(base);
                    await writer.write(base, next);
                    workspaceStorage.removeItem('jackyun_debug_unsaved_edit:practice-timer:' + recovery.id);
                    sessionBases.set(recovery.id, structuredClone(recovery));
                    if (message.config) configBase = structuredClone(message.config);
                    window.dispatchEvent(new Event('jackyun-sync-edit'));
                    send({type:'practice-saved', requestId:message.requestId, cloudPending:true});
                    return;
                  }
                  send({type:'practice-saved', requestId:message.requestId, localOnly:true});
                  return;
                }
                if (live.ownerId !== message.controllerId) { send({type:'practice-control-lost'}); return; }
                // The server owns device arbitration; this single session replaces its stale Schedule replica.
                next = applyPracticeSession(next, message.session);
              } else next = applyPracticeSession(next, mergePracticeSession(sessionBases.get(message.session.id), message.session, state.practiceSessions?.find(s=>s.id===message.session.id)));
            }
            if (message.config) {
              const local=validateConfig(message.config), merged=threeWayMerge(configBase,local,state.practiceTimerConfig);
              if(merged.conflicts.length) throw Error('另一设备修改了相同时间设置，请重新打开页面；原设置已保留。');
              next = {...next, practiceTimerConfig:validateConfig(merged.merged)};
            }
          }
          writer.reset(base);
          await writer.write(base, next);
          if (message.session) workspaceStorage.removeItem('jackyun_debug_unsaved_edit:practice-timer:' + message.session.id);
          if (message.session) sessionBases.set(message.session.id,structuredClone(message.session));
          if (message.config) configBase=structuredClone(message.config);
          window.dispatchEvent(new Event('jackyun-sync-edit'));
          send({ type:'practice-saved', requestId:message.requestId });
        } catch (error) {
          if(error instanceof PracticeSessionConflict && message.session){
            try{
              const recovery=validateSession(message.session);
              workspaceStorage.setItem('jackyun_debug_unsaved_edit:practice-timer:'+recovery.id,JSON.stringify({session:recovery,config:message.config,conflict:true}));
              conflictedSessions.add(recovery.id);
              logger.warn('PracticeTimer','练习记录存在并发修改，已保留本机恢复副本并继续计时',{stage:message.type,sessionId:recovery.id,error:errorDetails(error)});
              send({type:'practice-saved',requestId:message.requestId,sessionId:recovery.id,localOnly:true,conflictPending:true});
              return;
            }catch(recoveryError){error=recoveryError;}
          }
          logger.error('PracticeTimer','练习计时器本机保存失败',{stage:message.type,error:errorDetails(error)});
          send({ type:'practice-error', requestId:message.requestId, error: error instanceof Error ? error.message : '保存失败，原数据已保留。' });
        }
      });
    };
    const refresh = () => { try { send({type:'practice-state',state:readRecoveredState(),remote:true}); } catch (error) { logger.error('PracticeTimer','同步刷新后读取 Schedule 失败',{stage:'refresh',error:errorDetails(error)});send({type:'practice-error',error:String(error)}); } };
    window.addEventListener('message', handler);
    // A cached iframe can announce readiness before React attaches this effect.
    // Reuse the existing state handshake once here; later ready messages still
    // cover a slow iframe without changing save, takeover or sync semantics.
    void initialize();
    window.addEventListener(CLOUD_STATE_APPLIED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('message',handler);window.removeEventListener(CLOUD_STATE_APPLIED_EVENT,refresh);window.removeEventListener('storage',refresh); };
  }, []);
  return <iframe ref={ref} src="/PracticeTimer.html" title="练习计时器" allow="fullscreen" allowFullScreen className={focused ? 'fixed inset-0 z-[200] h-dvh w-screen border-0' : 'h-[calc(100dvh-10rem)] min-h-[600px] w-full rounded-3xl border-0'} sandbox="allow-scripts allow-same-origin allow-downloads allow-top-navigation-by-user-activation" />;
}
