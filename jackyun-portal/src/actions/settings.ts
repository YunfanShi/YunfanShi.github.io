'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  return { supabase, user };
}

export async function getAiConfig(): Promise<{ baseUrl: string; apiKey: string; model: string }> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data } = await supabase
    .from('user_settings')
    .select('value')
    .eq('user_id', user.id)
    .eq('key', 'ai_config')
    .maybeSingle();
  const val = data?.value as { baseUrl?: string; apiKey?: string; model?: string } | null;
  return { baseUrl: val?.baseUrl ?? '', apiKey: val?.apiKey ?? '', model: val?.model ?? '' };
}

export async function saveAiConfig(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<{ error: string | null }> {
  const { supabase, user } = await getAuthenticatedUser();
  const { error } = await supabase.from('user_settings').upsert(
    {
      user_id: user.id,
      key: 'ai_config',
      value: { baseUrl, apiKey, model },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,key' },
  );
  if (error) return { error: error.message };
  return { error: null };
}

export type MusicSidebarMode = 'player' | 'sync';
export type AnswerSheetSidebarMode = 'standard' | 'sync';
export interface SidebarPreferences {
  musicMode: MusicSidebarMode;
  answerSheetMode: AnswerSheetSidebarMode;
}

const DEFAULT_SIDEBAR_PREFS: SidebarPreferences = { musicMode: 'player', answerSheetMode: 'standard' };

export async function getSidebarPreferences(): Promise<SidebarPreferences> {
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const { data } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', user.id)
      .eq('key', 'sidebar_preferences')
      .maybeSingle();
    const val = data?.value as Partial<SidebarPreferences> | null;
    if (val?.musicMode && val?.answerSheetMode) {
      return { musicMode: val.musicMode as MusicSidebarMode, answerSheetMode: val.answerSheetMode as AnswerSheetSidebarMode };
    }
    return { ...DEFAULT_SIDEBAR_PREFS };
  } catch {
    return { ...DEFAULT_SIDEBAR_PREFS };
  }
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
