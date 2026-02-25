'use server';

import { createClient } from '@/lib/supabase/server';

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
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
