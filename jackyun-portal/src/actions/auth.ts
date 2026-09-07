'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function signInWithIdentifier(
  identifier: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized || !password) return { success: false, error: '请输入账号和密码。' };

  let email = normalized;
  if (!normalized.includes('@')) {
    const admin = createAdminClient();
    if (!admin) return { success: false, error: 'ID 登录服务暂时不可用，请使用邮箱登录。' };
    const { data, error } = await admin
      .from('profiles')
      .select('email')
      .ilike('username', normalized)
      .maybeSingle();
    if (error || !data?.email) return { success: false, error: '账号或密码错误。' };
    email = data.email.toLowerCase();
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return { success: true };
  if (error.message.toLowerCase().includes('email not confirmed')) {
    return { success: false, error: '邮箱尚未验证，请检查验证邮件。' };
  }
  return { success: false, error: '账号或密码错误。' };
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

export async function requestPasswordReset(
  email: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?type=recovery`,
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function checkHasPassword(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const hasEmailIdentity = user.identities?.some((id) => id.provider === 'email') ?? false;
  return hasEmailIdentity;
}

export async function updatePasswordWithToken(
  newPassword: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  return { error: null };
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: 'Unauthorized' };

  // Re-authenticate with current password first
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (signInError) return { error: '当前密码不正确' };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  return { error: null };
}

export async function setInitialPassword(
  newPassword: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  return { error: null };
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
