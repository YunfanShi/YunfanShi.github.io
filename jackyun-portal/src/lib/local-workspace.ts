export const LOCAL_SYNC_META_KEY = 'jackyun_local_sync_meta_v1';
export const LOCAL_SYNC_STATUS_EVENT = 'jackyun-local-sync-status';
export const CLOUD_STATE_APPLIED_EVENT = 'jackyun-cloud-state-applied';
// One operation can contain both the previous and current value; 400k keeps
// that pair inside the 900k client batch and 1MB route limits.
export const MAX_SYNC_VALUE_CHARACTERS = 400_000;

/** Match the API limit after JSON encoding, including quotes and escapes. */
export function syncValueFits(value: unknown): boolean {
  try {
    return (JSON.stringify(value) ?? 'null').length <= MAX_SYNC_VALUE_CHARACTERS;
  } catch {
    return false;
  }
}

const SENSITIVE_STORAGE_KEYS = new Set([
  'jackyun-ai-config',
  'enforcer_pin',
]);
const BLOCKED_KEY = /(password|passwd|secret|auth|supabase|api[_-]?key|access[_-]?token|refresh[_-]?token|service[_-]?role|(^|[_-])sk([_-]|$)|deviceid|broadcast|cookie|guest_mode|debug|log)/i;

/** Product state may sync; credentials, auth state, device IDs and diagnostics never do. */
export function isSyncableStorageKey(key: string): boolean {
  return key.length > 0
    && key.length <= 120
    && key !== LOCAL_SYNC_META_KEY
    && key !== 'jackyun_sync_timestamps'
    && !SENSITIVE_STORAGE_KEYS.has(key)
    && !BLOCKED_KEY.test(key);
}

export function storageValueToString(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? 'null');
}
