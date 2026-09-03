'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Language } from '@/lib/i18n';
import { coerceNavigationPreferences, DEFAULT_NAVIGATION_PREFERENCES, type NavigationPreferencesV2 } from '@/lib/companion';
import { encryptSecret } from '@/lib/secret-crypto';

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return { supabase, user };
}

export async function getAiConfig(): Promise<{ baseUrl: string; apiKey: string; model: string; providerMode: 'cloud' | 'personal' }> {
  const { supabase, user } = await getAuthenticatedUser();
  const [{ data }, { data: secret }] = await Promise.all([supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', user.id)
    .eq('key', 'ai_config')
    .maybeSingle(), supabase.from('user_secrets').select('key').eq('user_id', user.id).eq('key', 'ai_api_key').maybeSingle()]);
  const val = data?.value as { baseUrl?: string; apiKey?: string; model?: string; providerMode?: string } | null;
  return { baseUrl: val?.baseUrl ?? '', apiKey: secret || val?.apiKey ? '__stored__' : '', model: val?.model ?? '', providerMode: val?.providerMode === 'personal' ? 'personal' : 'cloud' };
}

export async function saveAiConfig(
  baseUrl: string,
  apiKey: string,
  model: string,
  providerMode: 'cloud' | 'personal' = 'cloud',
): Promise<{ error: string | null }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const normalizedUrl = baseUrl.trim().replace(/\/+$/, '');
    if (normalizedUrl && !/^https:\/\//i.test(normalizedUrl)) return { error: 'AI Base URL 必须使用 HTTPS' };
    const normalizedKey = apiKey.trim();
    if (normalizedKey && normalizedKey !== '__stored__') {
      const { error: secretError } = await supabase.from('user_secrets').upsert({
        user_id: user.id,
        key: 'ai_api_key',
        encrypted_value: encryptSecret(normalizedKey),
        key_version: 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,key' });
      if (secretError) return { error: secretError.message };
    }
    const { data: secret } = await supabase.from('user_secrets').select('key').eq('user_id', user.id).eq('key', 'ai_api_key').maybeSingle();
    const { error } = await supabase.from('user_settings').upsert({
      user_id: user.id,
      key: 'ai_config',
      value: { baseUrl: normalizedUrl, model: model.trim().slice(0, 160), providerMode, hasApiKey: Boolean(secret) },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key' });
    return { error: error?.message ?? null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '保存 AI 配置失败' };
  }
}

export async function getLanguagePreference(): Promise<Language> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { data } = await supabase.from('user_settings').select('value').eq('user_id', user.id).eq('key', 'language_preference').maybeSingle();
    return (data?.value as { language?: string } | null)?.language === 'en' ? 'en' : 'zh';
  } catch { return 'zh'; }
}

export async function saveLanguagePreference(language: Language): Promise<{ error: string | null }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, key: 'language_preference', value: { language }, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    if (error) return { error: error.message };
    revalidatePath('/');
    return { error: null };
  } catch (error) { return { error: error instanceof Error ? error.message : '保存语言偏好失败' }; }
}

export type ThemePreference = 'light' | 'gray' | 'dark';
export async function getThemePreference(): Promise<ThemePreference> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { data } = await supabase.from('user_settings').select('value').eq('user_id', user.id).eq('key', 'theme_preference').maybeSingle();
    const theme = (data?.value as { theme?: string } | null)?.theme;
    return theme === 'gray' || theme === 'dark' ? theme : 'light';
  } catch { return 'light'; }
}
export async function saveThemePreference(theme: ThemePreference): Promise<{ error: string | null }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, key: 'theme_preference', value: { theme }, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    return { error: error?.message ?? null };
  } catch (error) { return { error: error instanceof Error ? error.message : '保存主题偏好失败' }; }
}

export type MusicSidebarMode = 'player' | 'sync';
export type AnswerSheetSidebarMode = 'standard' | 'sync';
export type SidebarPreferences = NavigationPreferencesV2;
const DEFAULT_SIDEBAR_PREFS: SidebarPreferences = DEFAULT_NAVIGATION_PREFERENCES;

export async function getSidebarPreferences(): Promise<SidebarPreferences> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { data } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', 'sidebar_preferences')
      .maybeSingle();
    return coerceNavigationPreferences(data?.value);
  } catch {
    return { ...DEFAULT_SIDEBAR_PREFS };
  }
}

export type SettingsKey = 'general_preferences' | 'appearance_preferences' | 'companion_preferences' | 'learning_preferences' | 'advanced_preferences';
const SETTINGS_KEYS: SettingsKey[] = ['general_preferences', 'appearance_preferences', 'companion_preferences', 'learning_preferences', 'advanced_preferences'];

function oneOf(value: unknown, allowed: readonly string[], fallback: string) { return typeof value === 'string' && allowed.includes(value) ? value : fallback; }
function integer(value: unknown, min: number, max: number, fallback: number) { const parsed = Math.round(Number(value)); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
function sanitizeSettingsSection(key: SettingsKey, value: Record<string, unknown>): Record<string, unknown> {
  if (key === 'general_preferences') return { startPage: oneOf(value.startPage, ['dashboard', 'study', 'time-management'], 'dashboard'), timezone: oneOf(value.timezone, ['auto', 'Asia/Shanghai'], 'auto'), notifications: value.notifications !== false };
  if (key === 'appearance_preferences') return { theme: oneOf(value.theme, ['light', 'gray', 'dark'], 'light'), density: oneOf(value.density, ['comfortable', 'compact'], 'comfortable'), reducedMotion: value.reducedMotion === true, showFullscreen: value.showFullscreen !== false };
  if (key === 'companion_preferences') return { enabled: value.enabled !== false, countAI: value.countAI !== false, idleSeconds: Number(oneOf(String(value.idleSeconds ?? ''), ['30', '60', '120', '300'], '60')), goalMinutes: integer(value.goalMinutes, 10, 1440, 120), retentionDays: Number(oneOf(String(value.retentionDays ?? ''), ['30', '90', '180', '365'], '365')), savePageTitles: value.savePageTitles === true };
  if (key === 'learning_preferences') return {
    streakReminder: value.streakReminder !== false,
    focusNotifications: value.focusNotifications !== false,
    quizUiLanguage: oneOf(value.quizUiLanguage, ['zh', 'en'], 'zh'),
    quizAnswerLanguage: oneOf(value.quizAnswerLanguage, ['zh_kw_en', 'zh', 'en', 'en_kw_zh', 'bilingual'], 'zh_kw_en'),
    quizFeedbackLevel: oneOf(value.quizFeedbackLevel, ['brief', 'normal', 'detailed'], 'normal'),
  };
  const releaseChannel = oneOf(value.releaseChannel, ['stable', 'preview'], value.betaFeatures === true ? 'preview' : 'stable');
  return { diagnostics: value.diagnostics === true, releaseChannel, betaFeatures: releaseChannel === 'preview' };
}

export async function saveSettingsSection(key: SettingsKey, value: Record<string, unknown>): Promise<{ error: string | null }> {
  if (!SETTINGS_KEYS.includes(key)) return { error: '不支持的设置分类' };
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const sanitized = sanitizeSettingsSection(key, value);
    const serialized = JSON.stringify(sanitized);
    if (serialized.length > 20000) return { error: '设置数据过大' };
    const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, key, value: sanitized, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    if (!error) { revalidatePath('/'); revalidatePath('/settings'); }
    return { error: error?.message ?? null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '保存设置失败' };
  }
}

export async function getSettingsSection(key: SettingsKey): Promise<Record<string, unknown>> {
  if (!SETTINGS_KEYS.includes(key)) return {};
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { data } = await supabase.from('user_settings').select('value').eq('user_id', user.id).eq('key', key).maybeSingle();
    return data?.value && typeof data.value === 'object' ? data.value as Record<string, unknown> : {};
  } catch { return {}; }
}

export async function saveSettingsField(key: SettingsKey, field: string, value: unknown): Promise<{ error: string | null }> {
  if (!SETTINGS_KEYS.includes(key) || !/^[a-z][a-zA-Z0-9]{0,63}$/.test(field)) return { error: '不支持的设置字段' };
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { data } = await supabase.from('user_settings').select('value').eq('user_id', user.id).eq('key', key).maybeSingle();
    const current = data?.value && typeof data.value === 'object' ? data.value as Record<string, unknown> : {};
    const sanitized = sanitizeSettingsSection(key, { ...current, [field]: value });
    const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, key, value: sanitized, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    if (!error) { revalidatePath('/'); revalidatePath('/settings'); }
    return { error: error?.message ?? null };
  } catch (error) { return { error: error instanceof Error ? error.message : '保存设置失败' }; }
}

export async function revokeCompanionDevice(deviceId: string): Promise<{ error: string | null }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { error } = await supabase.from('companion_devices').update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('id', deviceId);
    if (!error) revalidatePath('/settings');
    return { error: error?.message ?? null };
  } catch (error) { return { error: error instanceof Error ? error.message : '撤销设备失败' }; }
}

export async function renameCompanionDevice(deviceId: string, name: string): Promise<{ error: string | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(deviceId) || !name.trim() || name.trim().length > 80) return { error: '设备名称无效' };
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { error } = await supabase.from('companion_devices').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('id', deviceId).is('revoked_at', null);
    if (!error) revalidatePath('/settings');
    return { error: error?.message ?? null };
  } catch (error) { return { error: error instanceof Error ? error.message : '重命名设备失败' }; }
}

export async function deleteCompanionData(): Promise<{ error: string | null }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const results = await Promise.all([
      supabase.from('companion_activity_daily').delete().eq('user_id', user.id),
      supabase.from('companion_learning_queue').delete().eq('user_id', user.id),
      supabase.from('focus_sessions').delete().eq('user_id', user.id).eq('source', 'companion'),
    ]);
    const failure = results.find((result) => result.error)?.error;
    if (!failure) { revalidatePath('/activity'); revalidatePath('/dashboard'); }
    return { error: failure?.message ?? null };
  } catch (error) { return { error: error instanceof Error ? error.message : '删除 Companion 数据失败' }; }
}

export async function saveSidebarPreferences(prefs: SidebarPreferences): Promise<{ error: string | null }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { error } = await supabase.from('user_settings').upsert(
      {
        user_id: user.id,
        key: 'sidebar_preferences',
        value: prefs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,key' },
    );
    if (error) return { error: error.message };
    revalidatePath('/');
    revalidatePath('/settings');
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ── TTS Config ──────────────────────────────────────────────────────────────

export async function saveTtsConfig(
  engine: string,
  voiceURI: string,
  rate: number,
  pitch: number,
  autoSpeakAi: boolean,
  ttsLanguage: string,
): Promise<{ error: string | null }> {
  const { supabase, user } = await getAuthenticatedUser();
  const { error } = await supabase.from('user_settings').upsert(
    {
      user_id: user.id,
      key: 'tts_config',
      value: { engine, voiceURI, rate, pitch, autoSpeakAi, ttsLanguage },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,key' },
  );
  if (error) return { error: error.message };
  return { error: null };
}

export async function getTtsConfig(): Promise<{
  engine: string; voiceURI: string; rate: number; pitch: number;
  autoSpeakAi: boolean; ttsLanguage: string;
}> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', user.id)
    .eq('key', 'tts_config')
    .maybeSingle();
  const val = data?.value as {
    engine?: string; voiceURI?: string; rate?: number; pitch?: number;
    autoSpeakAi?: boolean; ttsLanguage?: string;
  } | null;
  return {
    engine: val?.engine ?? 'system',
    voiceURI: val?.voiceURI ?? '',
    rate: val?.rate ?? 1.0,
    pitch: val?.pitch ?? 1.0,
    autoSpeakAi: val?.autoSpeakAi ?? false,
    ttsLanguage: val?.ttsLanguage ?? 'zh-CN',
  };
}

export async function updateProfile(
  displayName: string,
  avatarUrl: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    // 1. Update auth user metadata (user_name/display_name only)
    // NOTE: Do NOT put avatar_url here. base64 images can be 2-3KB+ and
    // Supabase embeds all user_metadata into the JWT. This caused Vercel 494
    // REQUEST_HEADER_TOO_LARGE (JWT + base64 avatar = 36KB → 17 cookie chunks).
    // Avatar is stored in profiles table only (see step 2).
    await supabase.auth.updateUser({
      data: {
        full_name: displayName,
        display_name: displayName,
      },
    });

    // 2. Upsert into profiles table (primary)
    // If the profiles table doesn't have an INSERT RLS policy, this will fail.
    // Since auth metadata and user_settings already persist the data, we treat
    // this as non-fatal and only log a warning.
    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        display_name: displayName,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (profileError) {
      // RLS INSERT policy may be missing → non-fatal, data is already in auth metadata
      console.warn('[updateProfile] profiles upsert warning (non-fatal):', profileError.message);
    }

    // 3. Also save to user_settings for backward compatibility
    const { error: settingsError } = await supabase.from('user_settings').upsert(
      {
        user_id: user.id,
        key: 'profile',
        value: { display_name: displayName, avatar_url: avatarUrl },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,key' },
    );
    if (settingsError) {
      console.warn('[updateProfile] user_settings upsert warning:', settingsError);
      // non-fatal, profiles already updated
    }

    // Force refresh the session so new metadata is available immediately
    await supabase.auth.refreshSession();

    revalidatePath('/settings');
    revalidatePath('/dashboard');
    return { success: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[updateProfile] exception:', err);
    return { success: false, error: message };
  }
}

export async function uploadAvatar(formData: FormData): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const file = formData.get('avatar');
    if (!(file instanceof File)) return { success: false, error: '请选择头像文件' };
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return { success: false, error: '仅支持 JPG、PNG 或 WebP 格式' };
    if (file.size > 2 * 1024 * 1024) return { success: false, error: '头像不能超过 2MB' };
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    const path = `${user.id}/avatar.${extension}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
    if (error) return { success: false, error: error.message };
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return { success: true, url: data.publicUrl };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '头像上传失败' };
  }
}
