export const SYNC_PAUSE_CHANGED_EVENT = 'jackyun-sync-pause-changed';
const STORAGE_PREFIX = 'jackyun_sync_pause_until_v1:';

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

export function getSyncPauseUntil(userId: string, now = Date.now()): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(storageKey(userId));
    const until = value === null ? NaN : Number(value);
    return Number.isFinite(until) && until > now ? until : null;
  } catch {
    return null;
  }
}

export function isSyncPaused(userId: string, now = Date.now()): boolean {
  return getSyncPauseUntil(userId, now) !== null;
}

export function pauseSync(userId: string, minutes: 15 | 30, now = Date.now()): number {
  const until = now + minutes * 60_000;
  window.localStorage.setItem(storageKey(userId), String(until));
  window.dispatchEvent(new CustomEvent(SYNC_PAUSE_CHANGED_EVENT, { detail: { userId, until } }));
  return until;
}

export function resumeSync(userId: string): void {
  window.localStorage.removeItem(storageKey(userId));
  window.dispatchEvent(new CustomEvent(SYNC_PAUSE_CHANGED_EVENT, { detail: { userId, until: null } }));
}
