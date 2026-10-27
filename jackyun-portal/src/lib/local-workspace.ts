import {WRITING_COLLECTIONS,writingCollectionForKey} from './sync/writing-resource-model.ts';

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
  'ai_key',
  'warden_key',
  'warden_ai_key',
  'llm_config',
  'jack_ai_config',
  'ai_config',
  'enforcer_pin',
]);
const LOCAL_ONLY_KEYS = new Set([
  'enforcer_sessions',
  'jackyun_ai_music_command',
  'jackyun_pomodoro_launch',
  'jackyun_schedule_output',
  'quizwise_ai_command',
  'warden_ai_command',
  'sync_position',
  'sync_isInput',
  'sme_v30_debug',
  'sme_v30_hijack',
  'sme_v30_autoclose',
  'jackyun-browser-ai-conversation-target',
]);
const LOCAL_ONLY_PREFIXES = ['jy_tr3000_', 'jackyun-browser-ai-recent-choice:', 'jackyun-savepoint-', 'jackyun-continue-', 'jackyun_novel_position_v2:', 'jackyun:seiue-course-review:v1:'];
const BLOCKED_KEY = /(password|passwd|secret|auth|supabase|api[_-]?key|(?:^|[_-])(?:llm|ds|deepseek|openai)[_-]?(?:api[_-]?)?key(?:$|[_-])|access[_-]?token|refresh[_-]?token|service[_-]?role|(^|[_-])sk([_-]|$)|deviceid|broadcast|cookie|guest_mode|debug)/i;
// A dated subject such as Biology is learning data, not a diagnostic log.
const DATED_SUBJECT_KEY = /^(check|prog)_\d{4}-\d{2}-\d{2}_.+$/i;

/** Product state may sync; credentials, auth state, device IDs and diagnostics never do. */
export function isSyncableStorageKey(key: string): boolean {
  if(WRITING_COLLECTIONS.some(collection=>key.startsWith(collection.prefix))&&!writingCollectionForKey(key))return false;
  return key.length > 0
    && (key.length <= 120 || key.length <= 162 && writingCollectionForKey(key)!==null)
    && key !== LOCAL_SYNC_META_KEY
    && key !== 'jackyun_settings_pending_v1'
    && key !== 'jackyun_sync_timestamps'
    && !LOCAL_ONLY_KEYS.has(key)
    && !LOCAL_ONLY_PREFIXES.some(prefix => key.startsWith(prefix))
    && !SENSITIVE_STORAGE_KEYS.has(key)
    && (!/log/i.test(key) || DATED_SUBJECT_KEY.test(key))
    && !BLOCKED_KEY.test(key);
}

export function storageValueToString(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? 'null');
}
