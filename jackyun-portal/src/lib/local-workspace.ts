export const LOCAL_SYNC_META_KEY = 'jackyun_local_sync_meta_v1';
export const LOCAL_SYNC_STATUS_EVENT = 'jackyun-local-sync-status';

const BLOCKED_KEY = /(password|passwd|secret|token|auth|supabase|api[_-]?key|(^|[_-])key($|[_-])|(^|[_-])sk([_-]|$)|deviceid|broadcast|session|cookie|guest_mode|enforcer_pin|debug|log)/i;

/** Product state may sync; credentials, auth state, device IDs and diagnostics never do. */
export function isSyncableStorageKey(key: string): boolean {
  return key.length > 0
    && key.length <= 120
    && key !== LOCAL_SYNC_META_KEY
    && !BLOCKED_KEY.test(key);
}

export function storageValueToString(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? 'null');
}
