'use client';

import { useEffect } from 'react';
import { useAuthMode } from '@/components/auth/auth-mode-provider';
import { usePathname } from 'next/navigation';
import { PAGE_PREFERENCE_KEY, PAGE_PROFILES, PREFERENCES_CHANGED, SETTINGS_PENDING_KEY } from '@/lib/page-preferences';
import { saveSettingsSection, type SettingsKey } from '@/actions/settings';

export default function PagePreferences({ initialValue, signedIn }: { initialValue: Record<string, unknown>; signedIn: boolean }) {
  const pathname = usePathname();
  const { userId } = useAuthMode();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const bind = () => navigator.serviceWorker.controller?.postMessage({ type: 'BIND_USER_CACHE', userId });
    bind(); navigator.serviceWorker.addEventListener('controllerchange', bind);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', bind);
  }, [userId]);

  useEffect(() => {
    const apply = () => {
      const main = document.querySelector<HTMLElement>('[data-portal-main]');
      if (!main) return;
      let value = initialValue;
      try {
        const raw = localStorage.getItem(PAGE_PREFERENCE_KEY);
        if (raw) value = JSON.parse(raw);
        else if (signedIn && Object.keys(initialValue).length) localStorage.setItem(PAGE_PREFERENCE_KEY, JSON.stringify(initialValue));
      } catch {}
      const page = PAGE_PROFILES.toSorted((a, b) => b.href.length - a.href.length).find(item => pathname === item.href || pathname.startsWith(`${item.href}/`));
      const id = page?.id;
      main.dataset.pageSize = value[`${id}:size`] === 'large' ? 'large' : 'normal';
      main.dataset.pageWidth = value[`${id}:width`] === 'reading' ? 'reading' : 'full';
      main.dataset.pageSpacing = value[`${id}:spacing`] === 'compact' ? 'compact' : 'comfortable';
      main.dataset.pageMotion = value[`${id}:motion`] === false ? 'false' : 'true';
    };
    apply();
    const events = [PREFERENCES_CHANGED, 'storage', 'jackyun-cloud-state-applied'];
    events.forEach(event => window.addEventListener(event, apply));
    return () => events.forEach(event => window.removeEventListener(event, apply));
  }, [initialValue, pathname, signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    let busy = false;
    let disposed = false;
    const flush = async () => {
      if (busy || !navigator.onLine || disposed) return;
      busy = true;
      const processQueue = async () => {
        const queues: Record<string, Record<string, string>> = JSON.parse(localStorage.getItem(SETTINGS_PENDING_KEY) || '{}');
        const owner = userId ?? 'guest';
        for (const [key, raw] of Object.entries({ ...queues.guest, ...queues[owner] })) {
          if (disposed || !navigator.onLine) break;
          const request = JSON.parse(raw);
          const result = await saveSettingsSection(key as SettingsKey, request.value, request.fields);
          if (result.error) break;
          const latest = JSON.parse(localStorage.getItem(SETTINGS_PENDING_KEY) || '{}');
          // Acknowledging an older request must never remove a newer edit.
          if (latest[owner]?.[key] === raw) delete latest[owner][key];
          if (latest.guest?.[key] === raw) delete latest.guest[key];
          localStorage.setItem(SETTINGS_PENDING_KEY, JSON.stringify(latest));
          window.dispatchEvent(new Event('jackyun-settings-acknowledged'));
        }
      };
      try {
        if (navigator.locks) await navigator.locks.request(`jackyun:settings:${userId}`, { ifAvailable: true }, async lock => { if (lock) await processQueue(); });
        else await processQueue();
      } catch { /* Durable pending settings retry when the connection recovers. */ }
      finally { busy = false; }
    };
    void flush();
    const trigger = () => { void flush(); };
    window.addEventListener('online', trigger);
    window.addEventListener(PREFERENCES_CHANGED, trigger);
    const timer = window.setInterval(trigger, 30_000);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('online', trigger); window.removeEventListener(PREFERENCES_CHANGED, trigger); };
  }, [signedIn, userId]);
  return null;
}
