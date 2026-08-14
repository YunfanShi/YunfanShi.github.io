'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { DiagnosticSnapshot } from '@/lib/logger';

export type TicketType = 'bug' | 'suggestion' | 'usage_help' | 'account_security' | 'suspension_appeal' | 'deletion_recovery';
export type CustomerSupportTicketType = Exclude<TicketType, 'suspension_appeal' | 'deletion_recovery'>;
export type AccountAppealTicketType = Extract<TicketType, 'suspension_appeal' | 'deletion_recovery'>;
type BugReportInput = { title: string; description: string; severity: 'low' | 'normal' | 'high' | 'critical'; pageUrl: string; ticketType?: CustomerSupportTicketType; diagnostics?: DiagnosticSnapshot };
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export async function submitBugReport(input: BugReportInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };
  const title = input.title.trim(); const description = input.description.trim();
  const diagnostics = input.diagnostics && JSON.stringify(input.diagnostics).length <= 180_000 ? input.diagnostics : undefined;
  const ticketType = input.ticketType ?? 'bug';
  const { data: report, error } = await supabase.from('bug_reports').insert({ user_id: user.id, title, description, severity: input.severity, ticket_type: ticketType, page_url: input.pageUrl.split('?')[0], diagnostics }).select('id').single();
  if (error) return { success: false, error: error.message };
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error('[SupportTicket] RESEND_API_KEY is not configured', { reportId: report.id, ticketType }); return { success: true, mailSent: false, mailError: '邮件服务尚未配置' }; }
  const attachment = diagnostics ? JSON.stringify(diagnostics, null, 2) : undefined;
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'JackYun-Portal/3.12', 'Idempotency-Key': `support-ticket-${report.id}` }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL ?? 'JackYun Portal <onboarding@resend.dev>', to: [process.env.BUG_REPORT_RECIPIENT_EMAIL ?? 'w.jack2025a@gmail.com'], subject: `人工客服咨询（${ticketType}）：${title}`, html: `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(description).replace(/\n/g, '<br>')}</p><p><b>类型：</b>${escapeHtml(ticketType)}<br><b>严重程度：</b>${escapeHtml(input.severity)}<br><b>页面：</b>${escapeHtml(input.pageUrl.split('?')[0])}<br><b>报告 ID：</b>${report.id}</p><p>${attachment ? '已附上经过脱敏的客户端诊断日志（网络、错误与点击轨迹）。' : '用户未附加客户端诊断日志。'}</p>`, attachments: attachment ? [{ filename: `support-ticket-${report.id}-diagnostics.json`, content: attachment }] : undefined }) });
    if (!response.ok) { const detail = (await response.text()).slice(0, 500); console.error('[BugReport] Resend send failed', { reportId: report.id, status: response.status, detail }); return { success: true, mailSent: false, mailError: `邮件服务返回 HTTP ${response.status}` }; }
    return { success: true, mailSent: true };
  } catch (cause) { console.error('[BugReport] Resend request failed', { reportId: report.id, cause: cause instanceof Error ? cause.message : String(cause) }); return { success: true, mailSent: false, mailError: '邮件服务网络请求失败' }; }
}

export type UserBugReport = { id: string; title: string; severity: 'low' | 'normal' | 'high' | 'critical'; status: 'open' | 'in_progress' | 'resolved' | 'closed'; ticket_type: TicketType; created_at: string; updated_at: string };
export async function getMyBugReports(): Promise<UserBugReport[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from('bug_reports').select('id, title, severity, status, ticket_type, created_at, updated_at').order('updated_at', { ascending: false }).limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as UserBugReport[];
}
export async function getMyTicketMessages(reportId: string): Promise<TicketMessage[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from('support_replies').select('id, body, author_id, message_kind, system_result, created_at, updated_at').eq('report_id', reportId).order('created_at');
  if (error) throw new Error(error.message);
  // The client only needs an ownership marker to decide whether to show Edit;
  // do not serialize its real auth user id into the support transcript.
  return (data ?? []).map((entry) => ({ ...entry, author_id: entry.author_id === user.id ? reportId : entry.author_id, is_admin: entry.author_id !== user.id })) as TicketMessage[];
}
export type MyTicketConversation = {
  id: string;
  title: string;
  status: UserBugReport['status'];
  ticket_type: TicketType;
  messages: TicketMessage[];
};
export async function getMyTicketConversation(reportId: string): Promise<MyTicketConversation | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: ticket, error } = await supabase
    .from('bug_reports')
    .select('id, title, status, ticket_type')
    .eq('id', reportId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !ticket) return null;
  const messages = await getMyTicketMessages(reportId);
  return { ...ticket, messages } as MyTicketConversation;
}
export async function addMyTicketMessage(reportId: string, body: string) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };
  const { error } = await supabase.from('support_replies').insert({ report_id: reportId, author_id: user.id, body: body.trim() });
  if (!error) await supabase.from('bug_reports').update({ updated_at: new Date().toISOString() }).eq('id', reportId).eq('user_id', user.id);
  return error ? { success: false, error: error.message } : { success: true };
}
export async function editMyTicketMessage(messageId: string, body: string) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };
  const { data, error } = await supabase.from('support_replies').update({ body: body.trim(), updated_at: new Date().toISOString() }).eq('id', messageId).eq('author_id', user.id).select('id').maybeSingle();
  return error || !data ? { success: false, error: error?.message ?? '该消息无法修改' } : { success: true };
}

export type BugReport = { id: string; user_id: string; title: string; description: string; severity: 'low' | 'normal' | 'high' | 'critical'; status: 'open' | 'in_progress' | 'resolved' | 'closed'; ticket_type: TicketType; page_url: string | null; created_at: string; updated_at: string; diagnostics: DiagnosticSnapshot | null };
export type TicketMessage = { id: string; body: string; author_id: string; is_admin?: boolean; author_name?: string; message_kind?: 'message' | 'resolution'; system_result?: string | null; created_at: string; updated_at: string };
export type TicketAuditEntry = { id: string; operation: string; details: Record<string, unknown>; created_at: string };
export type TicketDetail = { user: { id: string; email: string | null; display_name: string | null; avatar_url: string | null; created_at: string; account_status: string; deleted_at: string | null; suspended_reason: string | null; suspended_explanation: string | null } | null; messages: TicketMessage[]; notes: { id: string; body: string; author_id: string; created_at: string }[]; events: { id: string; event_type: 'status_changed' | 'internal_note'; previous_status: string | null; next_status: string | null; created_at: string }[]; operation_audit: TicketAuditEntry[] };

async function requireAdminFeedback() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const usernames = (process.env.ADMIN_USERS ?? process.env.AUTHORIZED_GITHUB_USERS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  const username = (user.user_metadata?.user_name as string | undefined)?.toLowerCase();
  if (profile?.role !== 'admin' && (!username || !usernames.includes(username))) throw new Error('Forbidden: Admin only');
  return supabase;
}

export async function getAdminBugReports(): Promise<BugReport[]> { const supabase = await requireAdminFeedback(); const { data, error } = await supabase.rpc('admin_list_bug_reports'); if (error) throw new Error(error.message); return (data ?? []) as BugReport[]; }
export async function getBugReportDetail(id: string): Promise<TicketDetail> { const supabase = await requireAdminFeedback(); const { data, error } = await supabase.rpc('admin_list_bug_report_details', { p_report_id: id }); if (error) throw new Error(error.message); return data as TicketDetail; }
export async function addTicketMessage(id: string, body: string) { const supabase = await requireAdminFeedback(); const { error } = await supabase.rpc('admin_add_ticket_message', { p_report_id: id, p_body: body }); if (!error) revalidatePath('/admin/tickets'); return error ? { success: false, error: error.message } : { success: true }; }
export async function editTicketMessage(messageId: string, body: string) { const supabase = await requireAdminFeedback(); const { error } = await supabase.rpc('admin_edit_ticket_message', { p_message_id: messageId, p_body: body }); if (!error) revalidatePath('/admin/tickets'); return error ? { success: false, error: error.message } : { success: true }; }
export async function closeBugReport(id: string, result: string) { const supabase = await requireAdminFeedback(); const { error } = await supabase.rpc('admin_close_bug_report', { p_report_id: id, p_result: result }); if (!error) revalidatePath('/admin/tickets'); return error ? { success: false, error: error.message } : { success: true }; }
export async function deleteBugReport(id: string) { const supabase = await requireAdminFeedback(); const { error } = await supabase.rpc('admin_delete_bug_report', { p_report_id: id }); if (!error) revalidatePath('/admin/tickets'); return error ? { success: false, error: error.message } : { success: true }; }
export async function updateBugReportStatus(id: string, status: BugReport['status']) { const supabase = await requireAdminFeedback(); const { error } = await supabase.rpc('admin_update_bug_report_status', { p_report_id: id, p_status: status }); if (!error) revalidatePath('/admin/tickets'); return error ? { success: false, error: error.message } : { success: true }; }
export async function addBugReportInternalNote(id: string, body: string) { const supabase = await requireAdminFeedback(); const { error } = await supabase.rpc('admin_add_bug_report_note', { p_report_id: id, p_body: body }); if (!error) revalidatePath('/admin/tickets'); return error ? { success: false, error: error.message } : { success: true }; }
export async function resolveAccountAppeal(id: string, approved: boolean, response: string) { const supabase = await requireAdminFeedback(); const { error } = await supabase.rpc('admin_resolve_account_appeal', { p_report_id: id, p_approved: approved, p_response: response.trim() }); if (!error) { revalidatePath('/admin/tickets'); revalidatePath('/admin/users'); } return error ? { success: false, error: error.message } : { success: true }; }
export async function updateBugReportType(id: string, ticketType: TicketType) { const supabase = await requireAdminFeedback(); const { error } = await supabase.rpc('admin_update_bug_report_type', { p_report_id: id, p_ticket_type: ticketType }); if (!error) revalidatePath('/admin/tickets'); return error ? { success: false, error: error.message } : { success: true }; }
export async function requestRemoteAssistance(id: string) { const supabase = await requireAdminFeedback(); const { data, error } = await supabase.rpc('admin_request_remote_assistance', { p_report_id: id }); return error ? { success: false, error: error.message } : { success: true, sessionId: data as string }; }
export async function getRemoteAssistanceSnapshot(sessionId: string) { const supabase = await requireAdminFeedback(); const { data, error } = await supabase.rpc('admin_get_remote_assistance_snapshot', { p_session_id: sessionId }); return error ? { success: false, error: error.message } : { success: true, snapshot: data as { preferences: Record<string, Record<string, string>> | null; ai_status: { configured: boolean; baseUrl: string | null; model: string | null } | null } }; }
export async function updateRemoteAssistancePreference(sessionId: string, key: 'language_preference' | 'theme_preference' | 'sidebar_preferences', value: Record<string, string>) { const supabase = await requireAdminFeedback(); const { error } = await supabase.rpc('admin_update_remote_preference', { p_session_id: sessionId, p_key: key, p_value: value }); if (!error) revalidatePath('/admin/tickets'); return error ? { success: false, error: error.message } : { success: true }; }
export async function restoreTicketUserAccount(id: string) { const supabase = await requireAdminFeedback(); const { error } = await supabase.rpc('admin_restore_ticket_user_account', { p_report_id: id }); if (!error) { revalidatePath('/admin/tickets'); revalidatePath('/admin/users'); } return error ? { success: false, error: error.message } : { success: true }; }
export async function repairTicketPreferences(id: string) { const supabase = await requireAdminFeedback(); const { error } = await supabase.rpc('admin_repair_ticket_preferences', { p_report_id: id }); if (!error) revalidatePath('/admin/tickets'); return error ? { success: false, error: error.message } : { success: true }; }
export async function exportTicketUserData(id: string) { const supabase = await requireAdminFeedback(); const { data, error } = await supabase.rpc('admin_export_ticket_user_data', { p_report_id: id }); if (!error) revalidatePath('/admin/tickets'); return error ? { success: false, error: error.message } : { success: true, archive: data as Record<string, unknown> }; }
export async function getMyRemoteAssistanceRequest(reportId: string): Promise<{ id: string; status: 'requested' | 'approved' | 'denied' | 'revoked' | 'expired' } | null> { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return null; const { data } = await supabase.from('remote_assistance_sessions').select('id, status').eq('report_id', reportId).eq('user_id', user.id).in('status', ['requested', 'approved']).order('created_at', { ascending: false }).limit(1).maybeSingle(); return data as { id: string; status: 'requested' | 'approved' | 'denied' | 'revoked' | 'expired' } | null; }
export async function respondRemoteAssistance(sessionId: string, approved: boolean) { const supabase = await createClient(); const { error } = await supabase.rpc('user_respond_remote_assistance', { p_session_id: sessionId, p_approved: approved }); return error ? { success: false, error: error.message } : { success: true }; }

export async function submitAccountAppeal(
  ticketType: AccountAppealTicketType,
  message: string,
): Promise<{ success: boolean; ticketId?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('account_status, deleted_at')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile) return { success: false, error: '无法读取账户状态' };
  if (ticketType === 'suspension_appeal' && profile.account_status !== 'suspended') {
    return { success: false, error: '当前账户未被暂停' };
  }
  if (ticketType === 'deletion_recovery') {
    if (!profile.deleted_at) return { success: false, error: '当前账户不在注销恢复期内' };
    const deadline = new Date(profile.deleted_at).getTime() + 30 * 24 * 60 * 60 * 1000;
    if (Date.now() > deadline) return { success: false, error: '30 天恢复期已结束' };
  }

  const { data: existing } = await supabase
    .from('bug_reports')
    .select('id')
    .eq('user_id', user.id)
    .eq('ticket_type', ticketType)
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return { success: true, ticketId: existing.id };

  const title = ticketType === 'suspension_appeal' ? '账户暂停申诉' : '注销账户恢复申请';
  const body = message.trim() || (ticketType === 'suspension_appeal' ? '请求管理员复核账户暂停决定。' : '请求在 30 天保留期内恢复账户。');
  const { data: report, error } = await supabase
    .from('bug_reports')
    .insert({
      user_id: user.id,
      title,
      description: body,
      severity: 'high',
      page_url: '/account-status',
      ticket_type: ticketType,
    })
    .select('id')
    .single();
  if (error) return { success: false, error: error.message };
  await supabase.from('support_replies').insert({ report_id: report.id, author_id: user.id, body });
  revalidatePath('/account-status');
  return { success: true, ticketId: report.id };
}
