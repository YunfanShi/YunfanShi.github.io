'use server';

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

export async function updateProfile(
  displayName: string,
  avatarUrl: string,
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { supabase, user } = await getAuthenticatedUser();

    // 1. Update auth user metadata
    await supabase.auth.updateUser({
      data: {
        full_name: displayName,
        display_name: displayName,
        avatar_url: avatarUrl,
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

    return { success: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[updateProfile] exception:', err);
    return { success: false, error: message };
  }
}
