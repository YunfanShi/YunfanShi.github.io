import { isSyncableStorageKey } from '../local-workspace.ts';

export const BACKUP_PAGES = [
  { id: 'schedule', label: 'Schedule 与课表' },
  { id: 'study', label: '学习计划与 StudyGuide' },
  { id: 'definitions', label: 'Definitions 与卡组' },
  { id: 'ielts', label: 'IELTS 阅读与写作' },
  { id: 'vocabulary', label: '词汇' },
  { id: 'quiz', label: 'Quiz 与答题' },
  { id: 'poetry', label: '诗词' },
  { id: 'music', label: '音乐' },
  { id: 'countdown', label: '倒计时与专注' },
  { id: 'relax', label: '放松记录' },
  { id: 'reader', label: '阅读书架（不含图书文件）' },
  { id: 'sites', label: '个人站点' },
  { id: 'settings', label: '界面与个人设置' },
  { id: 'other', label: '其他已同步页面数据' },
] as const;

export type BackupPage = typeof BACKUP_PAGES[number]['id'];
export const ALL_BACKUP_PAGES: BackupPage[] = BACKUP_PAGES.map((page) => page.id);

export const BACKUP_TABLES = [
  'vocab_words', 'vocab_stats', 'vocab_settings',
  'study_plans', 'study_tasks', 'study_syllabus', 'study_config', 'study_mock_records',
  'poems', 'poem_sessions', 'playlists', 'tracks', 'music_songs', 'music_settings',
  'countdowns', 'quiz_subjects', 'quiz_sessions', 'quiz_questions', 'quiz_settings',
  'review_items', 'review_attempts', 'relax_chat', 'relax_state',
  'focus_settings', 'focus_tasks', 'focus_sessions',
  'reader_books', 'personal_sites', 'companion_learning_queue', 'timetable_hub_data',
  'user_settings', 'legacy_sync_data',
] as const;
export type BackupTable = typeof BACKUP_TABLES[number];

const TABLE_PAGE: Record<Exclude<BackupTable, 'legacy_sync_data'>, BackupPage> = {
  vocab_words: 'vocabulary', vocab_stats: 'vocabulary', vocab_settings: 'vocabulary',
  study_plans: 'study', study_tasks: 'study', study_syllabus: 'study', study_config: 'study', study_mock_records: 'study',
  poems: 'poetry', poem_sessions: 'poetry',
  playlists: 'music', tracks: 'music', music_songs: 'music', music_settings: 'music',
  countdowns: 'countdown', focus_settings: 'countdown', focus_tasks: 'countdown', focus_sessions: 'countdown',
  quiz_subjects: 'quiz', quiz_sessions: 'quiz', quiz_questions: 'quiz', quiz_settings: 'quiz',
  review_items: 'quiz', review_attempts: 'quiz',
  relax_chat: 'relax', relax_state: 'relax', user_settings: 'settings',
  reader_books: 'reader', personal_sites: 'sites',
  companion_learning_queue: 'study', timetable_hub_data: 'schedule',
};

export function tableBackupPage(table: Exclude<BackupTable, 'legacy_sync_data'>): BackupPage {
  return TABLE_PAGE[table];
}

const SAFE_SETTINGS_KEYS = new Set([
  'general_preferences', 'appearance_preferences', 'companion_preferences',
  'learning_preferences', 'advanced_preferences', 'language_preference',
  'theme_preference', 'sidebar_preferences', 'interface_customization', 'profile',
  'tts_config',
]);

export function isBackupableSettingKey(key: unknown): key is string {
  return typeof key === 'string' && SAFE_SETTINGS_KEYS.has(key);
}

export function isBackupableLegacyKey(key: unknown): key is string {
  return typeof key === 'string' && isSyncableStorageKey(key)
    && !/^(?:eruda-|getItem$|setItem$|removeItem$|jackyun_nav_timestamps$|jackyun_nav_usage_pending$|jackyun_backup_local_limit$)/.test(key);
}

export function legacyBackupPage(key: string): BackupPage {
  if (/^(?:jackyun_schedule_|jack_timetable_|w3_schedule$)/.test(key)) return 'schedule';
  if (/^(?:studyguide_|caie_|jackyun_goal_|jackyun_daily_plan$|th2_|control_|jackyun_control_)/.test(key)) return 'study';
  if (/^(?:jackyun_definition_|jackyun_property_)/.test(key)) return 'definitions';
  if (key.startsWith('jackyun_ielts_')) return 'ielts';
  if (key.startsWith('LexiFlowPro_')) return 'vocabulary';
  if (/^(?:quizwise_|igcse_|jackyun_answer_sheet_)/.test(key)) return 'quiz';
  if (key === 'poemHistory') return 'poetry';
  if (/^(?:v45_songs$|w3_song|w3_voice$|w10_autobgm$|bili_)/.test(key)) return 'music';
  if (/^(?:jack_countdown_|jackyun_pomodoro_|cd_v2$|jack_water$|w3_date$|w3_week_plan$|gt_)/.test(key)) return 'countdown';
  if (/^(?:jackyun_relax_|jackyun_settings_|jackyun_sidebar_|jackyun_theme$|jack_theme$|jack_lang_|jackyun_language$|show_fullscreen_btn$|profile$)/.test(key)) return 'settings';
  return 'other';
}

export function normalizeBackupPages(pages: unknown): BackupPage[] {
  if (!Array.isArray(pages) || !pages.length) throw new Error('请至少选择一个页面。');
  const allowed = new Set<BackupPage>(ALL_BACKUP_PAGES);
  if (pages.some((page) => !allowed.has(page))) throw new Error('包含不支持的备份页面。');
  return [...new Set(pages as BackupPage[])];
}
