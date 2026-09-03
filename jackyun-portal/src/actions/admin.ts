'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { SiteNotification, WhitelistEmail, WhitelistUsername } from '@/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminIdentity } from '@/lib/admin-auth';

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
  // Database role is authoritative; a verified admin email can bootstrap it.
  if (!isAdminIdentity(user, profile?.role)) {
    throw new Error('Forbidden: Admin only');
  }
  if (profile?.role !== 'admin') {
    await createAdminClient()?.from('profiles').update({ role: 'admin', updated_at: new Date().toISOString() }).eq('id', user.id);
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
  const { supabase } = await requireAdmin();

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
  const { supabase } = await requireAdmin();
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
  const { supabase } = await requireAdmin();
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

// ===== Admin Manager =====

export async function getAdmins(): Promise<{ id: string; email: string | null; display_name: string | null; created_at: string }[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, created_at')
    .eq('role', 'admin')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type ManagedUser = {
  id: string; email: string | null; display_name: string | null; avatar_url: string | null;
  role: string; account_status: 'active' | 'suspended'; suspended_reason: string | null; suspended_explanation: string | null;
  created_at: string; updated_at: string; deleted_at: string | null; focus_sessions: number; legacy_records: number;
};

export type NetworkDevice = {
  id: string;
  mac_address: string | null;
  private_ip: string | null;
  claimed_name: string;
  admin_label: string | null;
  relationship: string | null;
  device_label: string | null;
  router_nas_id: string | null;
  access_tier: 'trusted' | 'known' | 'guest' | 'unknown';
  access_policy: 'review' | 'unrestricted' | 'limited' | 'blocked';
  desired_download_mbps: number | null;
  desired_upload_mbps: number | null;
  router_note: string | null;
  admin_notes: string | null;
  sync_status: 'pending_review' | 'pending_apply' | 'applied' | 'error';
  identifiers_supplied: boolean;
  registration_count: number;
  last_registered_at: string;
  updated_at: string;
};

export type NetworkDeviceUpdate = Pick<
  NetworkDevice,
  'id' | 'admin_label' | 'access_tier' | 'access_policy' | 'desired_download_mbps' |
  'desired_upload_mbps' | 'router_note' | 'admin_notes' | 'sync_status'
>;

export async function getNetworkDevices(): Promise<NetworkDevice[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('admin_list_network_devices');
  if (error) throw new Error(error.message);
  return ((data ?? []) as NetworkDevice[]).map((device) => ({
    ...device,
    desired_download_mbps: device.desired_download_mbps === null ? null : Number(device.desired_download_mbps),
    desired_upload_mbps: device.desired_upload_mbps === null ? null : Number(device.desired_upload_mbps),
    registration_count: Number(device.registration_count),
  }));
}

export async function updateNetworkDevice(
  input: NetworkDeviceUpdate,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requireAdmin();
  const download = input.access_policy === 'limited' ? Number(input.desired_download_mbps) : null;
  const upload = input.access_policy === 'limited' ? Number(input.desired_upload_mbps) : null;
  if (input.access_policy === 'limited' && (
    !Number.isFinite(download) || !Number.isFinite(upload) || download! <= 0 || upload! <= 0
  )) {
    return { success: false, error: '限速策略需要有效的上下行速率。' };
  }
  const { error } = await supabase.rpc('admin_update_network_device', {
    p_id: input.id,
    p_admin_label: input.admin_label?.trim() || null,
    p_access_tier: input.access_tier,
    p_access_policy: input.access_policy,
    p_download_mbps: download,
    p_upload_mbps: upload,
    p_router_note: input.router_note?.trim() || null,
    p_admin_notes: input.admin_notes?.trim() || null,
    p_sync_status: input.sync_status,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath('/admin/network');
  return { success: true };
}

export async function getManagedUsers(): Promise<ManagedUser[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw new Error(error.message);
  return ((data ?? []) as ManagedUser[]).map((row: ManagedUser) => ({ ...row, focus_sessions: Number(row.focus_sessions), legacy_records: Number(row.legacy_records) }));
}

export async function inviteUserAccount(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin();
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { success: false, error: '请输入有效邮箱。' };
    const admin = createAdminClient();
    if (!admin) return { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY 未配置，无法创建邀请。' };
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const { error } = await admin.auth.admin.inviteUserByEmail(normalized, { redirectTo: `${siteUrl}/auth/callback` });
    if (error) return { success: false, error: error.message };
    revalidatePath('/admin/users');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '邀请账户失败。' };
  }
}

export async function setAccountStatus(
  userId: string,
  status: 'active' | 'suspended',
  reason?: string,
  explanation?: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc('admin_set_account_status', {
    target_id: userId,
    next_status: status,
    reason: reason ?? null,
    explanation: explanation ?? null,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

/** Send the same recovery link that a user can request from the sign-in page. */
export async function sendPasswordResetForUser(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requireAdmin();
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) return { success: false, error: profileError.message };
  if (!profile?.email) return { success: false, error: '该用户没有可用于重置密码的邮箱。' };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000');
  const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
    redirectTo: `${siteUrl}/auth/callback?type=recovery`,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getSyncOverview(): Promise<{ source: string; records: number; most_recent: string | null }[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('admin_sync_overview');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { source: string; records: number | string; most_recent: string | null }[]).map((row) => ({ source: row.source, records: Number(row.records), most_recent: row.most_recent }));
}

export type DashboardOverview = {
  metrics: { total_users: number; new_users: number; active_notifications: number; open_reports: number; restricted_accounts: number };
  trends: Record<'users' | 'reports' | 'focus_minutes', { date: string; value: number }[]>;
  todos: {
    reports: { id: string; title: string; severity: string; status: string; created_at: string }[];
    accounts: { id: string; display_name: string | null; email: string | null; account_status: string; deleted_at: string | null }[];
    notifications: { id: string; title: string; start_time: string | null; end_time: string | null; is_active: boolean }[];
  };
};

export async function getDashboardOverview(days: 7 | 30 = 30): Promise<DashboardOverview> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('admin_dashboard_overview', { p_days: days });
  if (error) throw new Error(error.message);
  return data as DashboardOverview;
}

export async function addAdmin(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requireAdmin();

  // Find the user by email in profiles
  const { data: profile, error: findError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (findError) return { success: false, error: findError.message };
  if (!profile) return { success: false, error: '未找到该邮箱对应的用户' };
  if (profile.role === 'admin') return { success: false, error: '该用户已经是管理员' };

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ role: 'admin', updated_at: new Date().toISOString() })
    .eq('id', profile.id);

  if (updateError) return { success: false, error: updateError.message };
  revalidatePath('/admin');
  return { success: true };
}

export async function removeAdmin(
  targetUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await requireAdmin();

  // Cannot remove yourself
  if (targetUserId === user.id) {
    return { success: false, error: '不能移除自己的管理员权限' };
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ role: 'user', updated_at: new Date().toISOString() })
    .eq('id', targetUserId)
    .eq('role', 'admin');

  if (updateError) return { success: false, error: updateError.message };
  revalidatePath('/admin');
  return { success: true };
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

// ===== Site Notifications =====

export interface NotificationInput {
  title: string;
  content: string;
  content_type: 'html' | 'markdown';
  delivery_type: 'notice' | 'message';
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
}

/**
 * 获取当前用户待展示的活跃通知（未过期、未关闭）
 * 用于全站弹窗：只在 portal 页面加载时调用
 */
export async function getActiveNotifications(): Promise<SiteNotification[]> {
  const { supabase } = await getAuthenticatedUser();
  const now = new Date().toISOString();

  // 1. 获取所有启用的、时间范围内的通知
  const { data: notifications, error } = await supabase
    .from('site_notifications')
    .select('*')
    .eq('is_active', true)
    .eq('delivery_type', 'notice')
    .or(`start_time.is.null,start_time.lte.${now}`)
    .or(`end_time.is.null,end_time.gte.${now}`)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  if (!notifications || notifications.length === 0) return [];

  // 2. 过滤掉该用户已关闭的通知
  const ids = notifications.map((n) => n.id);
  const { data: dismissals } = await supabase
    .from('notification_dismissals')
    .select('notification_id')
    .in('notification_id', ids);

  const dismissedIds = new Set((dismissals ?? []).map((d) => d.notification_id));
  return notifications.filter((n) => !dismissedIds.has(n.id)) as SiteNotification[];
}

/** Active announcements for the persistent notification center. */
export async function getNotificationInbox(): Promise<SiteNotification[]> {
  const { supabase } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from('site_notifications')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const notifications = (data ?? []) as SiteNotification[];
  if (!notifications.length) return [];
  const { data: dismissals, error: dismissalsError } = await supabase
    .from('notification_dismissals')
    .select('notification_id')
    .in('notification_id', notifications.map((item) => item.id));
  if (dismissalsError) throw new Error(dismissalsError.message);
  const dismissed = new Set((dismissals ?? []).map((item) => item.notification_id));
  // Old rapid retries may have produced identical support messages. Show only
  // the newest copy; deleting it hides the entire duplicate group for this user.
  const seenMessages = new Set<string>();
  return notifications.filter((item) => {
    if (item.delivery_type !== 'message') return !dismissed.has(item.id);
    const key = `${item.title}\u0000${item.content}\u0000${item.recipient_user_id ?? ''}`;
    if (seenMessages.has(key)) return false;
    seenMessages.add(key);
    return !dismissed.has(item.id);
  });
}

/**
 * 获取所有通知（管理员面板用，包括禁用/过期的）
 * 通过 SECURITY DEFINER 函数 list_site_notifications() 调用，
 * 函数内部校验 profiles.role='admin'，避免 RLS 权限问题。
 */
export async function getAllNotifications(): Promise<SiteNotification[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc('list_site_notifications');
  if (error) throw new Error(error.message);
  // The announcement manager is intentionally public-only. Support outcomes
  // are private inbox messages and must never appear beside broadcast content.
  return ((data ?? []) as SiteNotification[]).filter((notification) => notification.recipient_user_id === null);
}

/**
 * 创建通知（管理员）
 * 通过 SECURITY DEFINER 函数 create_site_notification(payload jsonb) 调用，
 * 函数内部校验 profiles.role='admin'。
 */
export async function createNotification(
  input: NotificationInput,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase.rpc('create_site_notification', {
    payload: {
      title: input.title.trim(),
      content: input.content,
      content_type: input.content_type,
      delivery_type: input.delivery_type,
      is_active: input.is_active,
      start_time: input.start_time || null,
      end_time: input.end_time || null,
    },
  });

  if (error) return { success: false, error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

/**
 * 更新通知（管理员）
 * 通过 SECURITY DEFINER 函数 update_site_notification(p_id uuid, payload jsonb) 调用，
 * 函数内部校验 profiles.role='admin'。
 */
export async function updateNotification(
  id: string,
  input: NotificationInput,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase.rpc('update_site_notification', {
    p_id: id,
    payload: {
      title: input.title.trim(),
      content: input.content,
      content_type: input.content_type,
      delivery_type: input.delivery_type,
      is_active: input.is_active,
      start_time: input.start_time || null,
      end_time: input.end_time || null,
    },
  });

  if (error) return { success: false, error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

/**
 * 删除通知（管理员）
 * 通过 SECURITY DEFINER 函数 delete_site_notification(p_id uuid) 调用，
 * 函数内部校验 profiles.role='admin'。
 */
export async function deleteNotification(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requireAdmin();

  const { error } = await supabase.rpc('delete_site_notification', {
    p_id: id,
  });

  if (error) return { success: false, error: error.message };
  revalidatePath('/admin');
  return { success: true };
}

/**
 * 用户关闭一条通知（写入 dismissals 表）
 */
export async function dismissNotification(
  notificationId: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase.from('notification_dismissals').upsert({
    notification_id: notificationId,
    user_id: user.id,
  }, { onConflict: 'notification_id,user_id', ignoreDuplicates: true });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Mark a group of notifications as read for the current user. */
export async function dismissNotifications(
  notificationIds: string[],
): Promise<{ success: boolean; error?: string }> {
  const uniqueIds = Array.from(new Set(notificationIds)).filter(Boolean).slice(0, 500);
  if (!uniqueIds.length) return { success: true };

  const { supabase, user } = await getAuthenticatedUser();
  // RLS limits this lookup to public notifications and messages addressed to
  // the signed-in user, so arbitrary ids cannot be acknowledged here.
  const { data: visible, error: visibleError } = await supabase
    .from('site_notifications')
    .select('id')
    .in('id', uniqueIds);
  if (visibleError) return { success: false, error: visibleError.message };
  if (!visible?.length) return { success: true };

  const { error } = await supabase.from('notification_dismissals').upsert(
    visible.map(({ id }) => ({ notification_id: id, user_id: user.id })),
    { onConflict: 'notification_id,user_id', ignoreDuplicates: true },
  );
  return error ? { success: false, error: error.message } : { success: true };
}

/** Clear unread admin messages as soon as their support conversation is open. */
export async function dismissTicketNotifications(
  ticketId: string,
): Promise<{ success: boolean; error?: string }> {
  const { supabase, user } = await getAuthenticatedUser();
  const { data: ticket, error: ticketError } = await supabase
    .from('bug_reports')
    .select('id')
    .eq('id', ticketId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (ticketError) return { success: false, error: ticketError.message };
  if (!ticket) return { success: false, error: '客服对话不存在' };

  const { data: notifications, error: notificationError } = await supabase
    .from('site_notifications')
    .select('id')
    .eq('related_ticket_id', ticketId)
    .eq('recipient_user_id', user.id);
  if (notificationError) return { success: false, error: notificationError.message };
  if (!notifications?.length) return { success: true };

  const { error } = await supabase.from('notification_dismissals').upsert(
    notifications.map(({ id }) => ({ notification_id: id, user_id: user.id })),
    { onConflict: 'notification_id,user_id', ignoreDuplicates: true },
  );
  return error ? { success: false, error: error.message } : { success: true };
}
