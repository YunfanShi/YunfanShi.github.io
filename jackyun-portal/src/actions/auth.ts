'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function resolveUsernameToEmail(
  username: string,
): Promise<{ email: string | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('email')
    .eq('username', username)
    .single();
  if (error || !data) return { email: null, error: '用户名不存在' };
  return { email: data.email, error: null };
}

export async function syncProfile(
  userId: string,
  metadata: {
    provider: string;
    email?: string;
    displayName?: string;
    avatarUrl?: string;
    githubUsername?: string;
  },
): Promise<void> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('profiles')
    .select('id, linked_providers')
    .eq('id', userId)
    .single();

  const currentProviders: string[] = existing?.linked_providers ?? [];
  const updatedProviders = currentProviders.includes(metadata.provider)
    ? currentProviders
    : [...currentProviders, metadata.provider];

  const upsertData: Record<string, unknown> = {
    id: userId,
    linked_providers: updatedProviders,
    updated_at: new Date().toISOString(),
  };
  if (metadata.email) upsertData.email = metadata.email;
  if (metadata.displayName) upsertData.display_name = metadata.displayName;
  if (metadata.avatarUrl) upsertData.avatar_url = metadata.avatarUrl;
  if (metadata.githubUsername)
    upsertData.github_username = metadata.githubUsername;

  await supabase.from('profiles').upsert(upsertData, { onConflict: 'id' });
}

export async function linkProviderToUser(
  primaryUserId: string,
  providerInfo: {
    provider: string;
    providerEmail: string;
    providerUserId?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('linked_providers')
    .eq('id', primaryUserId)
    .single();

  if (fetchError || !profile) {
    return { success: false, error: '用户不存在' };
  }

  const currentProviders: string[] = profile.linked_providers ?? [];
  if (currentProviders.includes(providerInfo.provider)) {
    return { success: true };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      linked_providers: [...currentProviders, providerInfo.provider],
      updated_at: new Date().toISOString(),
    })
    .eq('id', primaryUserId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getLinkedProviders(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('linked_providers')
    .eq('id', userId)
    .single();
  return data?.linked_providers ?? [];
}

export async function unlinkProvider(
  userId: string,
  provider: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('linked_providers')
    .eq('id', userId)
    .single();

  if (fetchError || !profile) return { success: false, error: '用户不存在' };

  const updated = (profile.linked_providers ?? []).filter(
    (p: string) => p !== provider,
  );
  const { error } = await supabase
    .from('profiles')
    .update({ linked_providers: updated, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
