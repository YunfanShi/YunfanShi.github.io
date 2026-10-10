'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { EMPTY_NOTIFICATION_SNAPSHOT, notificationRefreshDue, type NotificationSnapshot } from './notification-snapshot';

type Reason = 'initial' | 'interval' | 'resume' | 'mutation';
type Listener = () => void;
type Message = { type: 'request' | 'snapshot'; userId: string; snapshot?: NotificationSnapshot };

class NotificationStore {
  private value = EMPTY_NOTIFICATION_SNAPSHOT;
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private pending = false;
  private stopped = true;
  private lastAttempt = -Infinity;
  private controller: AbortController | null = null;
  constructor(private userId: string) {}
  getSnapshot = () => this.value;
  private publish = (snapshot: NotificationSnapshot) => {
    this.value = snapshot;
    this.listeners.forEach(listener => listener());
  };
  private metadataKey = () => `jackyun:notification-poll:v1:${this.userId}`;
  private sharedAttempt = () => {
    try { return Number(localStorage.getItem(this.metadataKey())) || -Infinity; } catch { return this.lastAttempt; }
  };
  private receive = (event: MessageEvent<Message>) => {
    const message = event.data;
    if (message?.userId !== this.userId) return;
    if (message.type === 'request' && this.value !== EMPTY_NOTIFICATION_SNAPSHOT) {
      this.channel?.postMessage({ type: 'snapshot', userId: this.userId, snapshot: this.value });
    } else if (message.type === 'snapshot' && message.snapshot && Array.isArray(message.snapshot.items)) {
      this.publish(message.snapshot);
    }
  };
  private resume = () => { void this.refresh('resume'); };
  private dismissed = (event: Event) => {
    const detail = (event as CustomEvent<string | string[]>).detail;
    const ids = new Set(Array.isArray(detail) ? detail : [detail]);
    const remaining = this.value.items.filter(item => !ids.has(item.id));
    this.publish({ ...this.value, items: remaining, unreadCount: Math.max(0, this.value.unreadCount - this.value.items.filter(item => ids.has(item.id) && !item.is_read).length) });
    this.channel?.postMessage({ type: 'snapshot', userId: this.userId, snapshot: this.value });
  };
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    if (this.stopped) {
      this.stopped = false;
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel(`jackyun:notifications:${this.userId}`);
        this.channel.onmessage = this.receive;
        this.channel.postMessage({ type: 'request', userId: this.userId });
      }
      this.timer = setInterval(() => { void this.refresh('interval'); }, 5000);
      window.addEventListener('online', this.resume);
      window.addEventListener('focus', this.resume);
      document.addEventListener('visibilitychange', this.resume);
      window.addEventListener('jackyun:notification-dismissed', this.dismissed);
      void this.refresh('initial');
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size) return;
      this.stopped = true;
      clearInterval(this.timer);
      this.controller?.abort();
      if (this.controller) {
        try { if (Number(localStorage.getItem(this.metadataKey())) === this.lastAttempt) localStorage.removeItem(this.metadataKey()); } catch { /* Storage may be disabled. */ }
      }
      this.channel?.close(); this.channel = null;
      window.removeEventListener('online', this.resume);
      window.removeEventListener('focus', this.resume);
      document.removeEventListener('visibilitychange', this.resume);
      window.removeEventListener('jackyun:notification-dismissed', this.dismissed);
      // Account content never survives logout/unmount in a dormant store.
      this.value = EMPTY_NOTIFICATION_SNAPSHOT;
      this.lastAttempt = -Infinity;
    };
  };
  refresh = async (reason: Reason = 'mutation') => {
    if (this.pending || this.stopped) return;
    const eligible = () => notificationRefreshDue(Date.now(), Math.max(this.lastAttempt, this.sharedAttempt()), document.visibilityState === 'visible', navigator.onLine);
    if (!eligible()) return;
    this.pending = true;
    const request = async () => {
      if (!eligible() || this.stopped) return;
      this.lastAttempt = Date.now();
      try { localStorage.setItem(this.metadataKey(), String(this.lastAttempt)); } catch { /* Single-tab gate still works. */ }
      const controller = new AbortController(); this.controller = controller;
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const started = performance.now();
      try {
        const response = await fetch(`/api/notifications/snapshot?reason=${reason}`, { cache: 'no-store', signal: controller.signal });
        if (response.status === 401 || response.status === 403) { this.publish(EMPTY_NOTIFICATION_SNAPSHOT); return; }
        if (!response.ok) return;
        const result = await response.json();
        console.debug('[notification-snapshot]', { requestId: response.headers.get('X-Request-ID'), reason, durationMs: Math.round(performance.now() - started) });
        if (this.stopped || result.userId !== this.userId || !Array.isArray(result.items)) return;
        const snapshot: NotificationSnapshot = { items: result.items, unreadCount: result.unreadCount, hasMore: result.hasMore, nextOffset: result.nextOffset };
        this.publish(snapshot);
        this.channel?.postMessage({ type: 'snapshot', userId: this.userId, snapshot });
      } catch { /* Keep existing notices; the next bounded tick retries. */ }
      finally { clearTimeout(timeout); if (this.controller === controller) this.controller = null; }
    };
    try {
      if (navigator.locks) {
        // A fresh timestamp is checked again INSIDE the origin-wide lock.
        await navigator.locks.request(this.metadataKey(), { ifAvailable: true }, async lock => { if (lock) await request(); });
      } else {
        // Older browsers use a short, ownership-checked lease, never a permanent leader.
        const key = `${this.metadataKey()}:lease`, token = crypto.randomUUID();
        let acquired = false;
        try {
          const previous = JSON.parse(localStorage.getItem(key) ?? 'null');
          if (previous?.expires > Date.now()) return;
          localStorage.setItem(key, JSON.stringify({ token, expires: Date.now() + 20_000 }));
          await new Promise(resolve => setTimeout(resolve, 50));
          acquired = JSON.parse(localStorage.getItem(key) ?? 'null')?.token === token;
          if (acquired) await request();
        } finally {
          if (acquired && JSON.parse(localStorage.getItem(key) ?? 'null')?.token === token) localStorage.removeItem(key);
        }
      }
    } finally { this.pending = false; }
  };
}

// Client-side store only; no user payload is persisted in localStorage.
const stores = new Map<string, NotificationStore>();
const emptySubscribe = () => () => {};
export function useNotificationSnapshot(userId: string | null) {
  let store: NotificationStore | undefined;
  if (userId && typeof window !== 'undefined') {
    store = stores.get(userId);
    if (!store) { store = new NotificationStore(userId); stores.set(userId, store); }
  }
  const snapshot = useSyncExternalStore(store?.subscribe ?? emptySubscribe, store?.getSnapshot ?? (() => EMPTY_NOTIFICATION_SNAPSHOT), () => EMPTY_NOTIFICATION_SNAPSHOT);
  const refresh = useCallback(() => store?.refresh(), [store]);
  return { snapshot, refresh };
}
