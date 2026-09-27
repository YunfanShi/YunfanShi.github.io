'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CLOUD_STATE_APPLIED_EVENT } from '@/lib/local-workspace';
import { getOutbox } from '@/lib/sync/outbox';
import { listOfflineMutations } from '@/lib/offline/workspace';
import { BEFORE_SLEEP_EVENT, LOCAL_SLEEP_SAVE_EVENT, WAKE_EVENT, IDLE_SETTINGS_EVENT, createIdleController, readIdleMinutes, setWorkspaceSleeping, isWorkspaceSleeping, type SleepRequest } from '@/lib/workspace-idle';

export default function WorkspaceIdle({ userId }: { userId: string | null }) {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let minutes = readIdleMinutes();
    const auth = createClient().auth;
    // Public auth methods remove the SDK visibility handler, so manage it here.
    let authWork = Promise.resolve();
    const updateAuth = () => {
      authWork = authWork.then(async () => {
        if (!disposed && !isWorkspaceSleeping() && document.visibilityState === 'visible') await auth.startAutoRefresh();
        else await auth.stopAutoRefresh();
      }).catch((error) => console.warn('[workspace-idle] auth refresh', error));
    };
    let pendingCount = 0;
    const controller = createIdleController(Date.now, async () => {
      setNotice('空闲中，正在保存内容…');
      const jobs: Promise<unknown>[] = [];
      window.dispatchEvent(new CustomEvent<SleepRequest>(BEFORE_SLEEP_EVENT, { detail: { waitUntil: (job) => jobs.push(job) } }));
      await Promise.all(jobs);
      const localJobs: Promise<unknown>[] = [];
      window.dispatchEvent(new CustomEvent<SleepRequest>(LOCAL_SLEEP_SAVE_EVENT, { detail: { waitUntil: (job) => localJobs.push(job) } }));
      await Promise.all(localJobs);
      pendingCount = (await getOutbox()).length + (userId ? (await listOfflineMutations(userId)).length : 0);
    }, () => {
      if (disposed) return;
      setWorkspaceSleeping(true);
      setNotice(pendingCount ? `已保存到本机，${pendingCount} 项修改待上传。已休眠，操作即可唤醒。` : '已保存并休眠，操作即可唤醒。');
      updateAuth();
    }, () => {
      setWorkspaceSleeping(false);
      setNotice(null);
      updateAuth();
      window.dispatchEvent(new Event(WAKE_EVENT));
    });
    const activity = () => { controller.activity(); setNotice(null); };
    const events = ['pointerdown', 'pointermove', 'keydown', 'input', 'wheel', 'touchstart'];
    const documents = new Map<Document, () => void>();
    const attach = (doc: Document) => {
      if (documents.has(doc)) return;
      events.forEach((event) => doc.addEventListener(event, activity, { passive: true, capture: true }));
      documents.set(doc, () => events.forEach((event) => doc.removeEventListener(event, activity, true)));
    };
    const attachFrames = () => {
      document.querySelectorAll('iframe').forEach((frame) => {
        try { if (frame.contentDocument) attach(frame.contentDocument); } catch { /* Cross-origin embeds are isolated. */ }
      });
      for (const [doc, detach] of documents) {
        if (doc !== document && !doc.defaultView?.frameElement?.isConnected) { detach(); documents.delete(doc); }
      }
    };
    attach(document);
    const onLoad = () => attachFrames();
    document.addEventListener('load', onLoad, true);
    const settings = () => { const next = readIdleMinutes(); if (next !== minutes) { minutes = next; activity(); } };
    window.addEventListener(IDLE_SETTINGS_EVENT, settings);
    window.addEventListener('storage', settings);
    window.addEventListener(CLOUD_STATE_APPLIED_EVENT, settings);
    document.addEventListener('visibilitychange', updateAuth);
    updateAuth();
    attachFrames();
    const timer = window.setInterval(() => {
      attachFrames();
      void controller.check(minutes).catch((error) => {
        console.error('[workspace-idle] save failed', error);
        if (!disposed) setNotice('本机保存失败，暂未休眠，请检查存储空间。');
      });
    }, 5_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      documents.forEach((detach) => detach());
      document.removeEventListener('load', onLoad, true);
      window.removeEventListener(IDLE_SETTINGS_EVENT, settings);
      window.removeEventListener('storage', settings);
      window.removeEventListener(CLOUD_STATE_APPLIED_EVENT, settings);
      document.removeEventListener('visibilitychange', updateAuth);
      setWorkspaceSleeping(false);
      void authWork.then(() => auth.startAutoRefresh());
    };
  }, [userId]);
  if (!notice) return null;
  return <div role="status" className="fixed bottom-20 left-1/2 z-[120] w-max max-w-[90vw] -translate-x-1/2 rounded-2xl bg-[#202124] px-4 py-3 text-sm text-white shadow-xl">{notice}</div>;
}
