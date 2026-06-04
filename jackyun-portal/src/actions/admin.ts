'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { WhitelistEmail, WhitelistUsername } from '@/types';

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return { supabase, user };
}

async function requireAdmin() {
  const { supabase, user } = await getAuthenticatedUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  // Allow if role is 'admin' OR user is in ADMIN_USERS env var (fallback)
  const adminUsers = (process.env.ADMIN_USERS ?? process.env.AUTHORIZED_GITHUB_USERS ?? '')
    .split(',')
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean);
  const githubUsername = (user.user_metadata?.user_name as string | undefined)?.toLowerCase();
  const isEnvAdmin = githubUsername ? adminUsers.includes(githubUsername) : false;
  if (profile?.role !== 'admin' && !isEnvAdmin) {
    throw new Error('Forbidden: Admin only');
  }
  return { supabase, user };
}

export async function getSystemInfo() {
  await getAuthenticatedUser();

  return {
    nextVersion:
      process.env.npm_package_dependencies_next ?? 'unknown',
    nodeVersion: process.version,
    buildTime: new Date().toISOString(),
  };
}

export async function getTableStats() {
  const { supabase } = await getAuthenticatedUser();

  const tables = [
    'vocab_words',
    'study_plans',
    'study_tasks',
    'poems',
    'playlists',
    'tracks',
    'countdowns',
  ] as const;

  const results = await Promise.all(
    tables.map(async (tableName) => {
      const { count } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
      return { tableName, count: count ?? 0 };
    }),
  );

  return results;
}

export async function getWhitelistInfo() {
  await getAuthenticatedUser();

  const rawUsers = process.env.AUTHORIZED_GITHUB_USERS ?? '';
  const rawEmails = process.env.AUTHORIZED_EMAILS ?? '';

  const githubUsers = rawUsers
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const emails = rawEmails
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((email) => {
      const atIndex = email.indexOf('@');
      if (atIndex < 0) return email;
      const local = email.slice(0, atIndex);
      const domain = email.slice(atIndex);
      const visible = local.slice(0, Math.min(2, local.length));
      return `${visible}***${domain}`;
    });

  return { githubUsers, emails };
}

// ===== Whitelist CRUD =====

export async function getWhitelistEmails(): Promise<WhitelistEmail[]> {
  const { supabase } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from('whitelist_emails')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addWhitelistEmail(
  email: string,
  note?: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await requireAdmin();
  const { error } = await supabase.from('whitelist_emails').insert({
    email: email.trim().toLowerCase(),
    note: note?.trim() || null,
    created_by: user.id,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

export async function removeWhitelistEmail(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from('whitelist_emails')
    .delete()
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

export async function getWhitelistUsernames(): Promise<WhitelistUsername[]> {
  const { supabase } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from('whitelist_usernames')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function addWhitelistUsername(
  username: string,
  platform: string,
  note?: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await requireAdmin();
  const { error } = await supabase.from('whitelist_usernames').insert({
    username: username.trim(),
    platform,
    note: note?.trim() || null,
    created_by: user.id,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

export async function removeWhitelistUsername(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from('whitelist_usernames')
    .delete()
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

export async function isUserWhitelisted(
  email?: string,
  username?: string,
  provider?: string,
): Promise<boolean> {
  const supabase = await createClient();

  if (email) {
    const { data } = await supabase
      .from('whitelist_emails')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (data) return true;
  }

  if (username && provider) {
    const { data } = await supabase
      .from('whitelist_usernames')
      .select('id')
      .eq('username', username)
      .eq('platform', provider)
      .maybeSingle();
    if (data) return true;
  }

  return false;
}

export async function forceAccountMerge(
  primaryIdOrEmail: string,
  secondaryIdOrEmail: string,
): Promise<{ success: boolean; error?: string; migratedTables?: string[] }> {
  const { supabase } = await requireAdmin();

  async function resolveUserId(idOrEmail: string): Promise<string | null> {
    // If it looks like a UUID, use directly
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(idOrEmail)) return idOrEmail;
    // Otherwise look up by email in profiles
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', idOrEmail.toLowerCase())
      .maybeSingle();
    return data?.id ?? null;
  }

  const primaryId = await resolveUserId(primaryIdOrEmail);
  const secondaryId = await resolveUserId(secondaryIdOrEmail);

  if (!primaryId) return { success: false, error: '找不到主账号' };
  if (!secondaryId) return { success: false, error: '找不到副账号' };
  if (primaryId === secondaryId) return { success: false, error: '两个账号相同' };

  const userDataTables = [
    'vocab_words',
    'study_plans',
    'study_tasks',
    'poems',
    'playlists',
    'tracks',
    'countdowns',
  ] as const;

  const migratedTables: string[] = [];

  for (const table of userDataTables) {
    const { error } = await supabase
      .from(table)
      .update({ user_id: primaryId })
      .eq('user_id', secondaryId);
    if (!error) migratedTables.push(table);
  }

  // Merge linked_providers from secondary profile into primary
  const { data: secProfile } = await supabase
    .from('profiles')
    .select('linked_providers')
    .eq('id', secondaryId)
    .single();

  if (secProfile?.linked_providers?.length) {
    const { data: priProfile } = await supabase
      .from('profiles')
      .select('linked_providers')
      .eq('id', primaryId)
      .single();
    const merged = Array.from(
      new Set([
        ...(priProfile?.linked_providers ?? []),
        ...secProfile.linked_providers,
      ]),
    );
    await supabase
      .from('profiles')
      .update({ linked_providers: merged, updated_at: new Date().toISOString() })
      .eq('id', primaryId);
  }

  revalidatePath('/admin');
  return { success: true, migratedTables };
}
