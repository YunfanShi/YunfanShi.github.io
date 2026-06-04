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
