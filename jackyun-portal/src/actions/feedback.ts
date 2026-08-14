'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { DiagnosticSnapshot } from '@/lib/logger';

type BugReportInput = { title: string; description: string; severity: 'low' | 'normal' | 'high' | 'critical'; pageUrl: string; diagnostics?: DiagnosticSnapshot };
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export async function submitBugReport(input: BugReportInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };
  const title = input.title.trim(); const description = input.description.trim();
  const diagnostics = input.diagnostics && JSON.stringify(input.diagnostics).length <= 180_000 ? input.diagnostics : undefined;
  const { data: report, error } = await supabase.from('bug_reports').insert({ user_id: user.id, title, description, severity: input.severity, page_url: input.pageUrl.split('?')[0], diagnostics }).select('id').single();
  if (error) return { success: false, error: error.message };
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error('[BugReport] RESEND_API_KEY is not configured', { reportId: report.id }); return { success: true, mailSent: false, mailError: '邮件服务尚未配置' }; }
  const attachment = diagnostics ? JSON.stringify(diagnostics, null, 2) : undefined;
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'JackYun-Portal/3.12', 'Idempotency-Key': `bug-report-${report.id}` }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL ?? 'JackYun Portal <onboarding@resend.dev>', to: [process.env.BUG_REPORT_RECIPIENT_EMAIL ?? 'w.jack2025a@gmail.com'], subject: `Bug 反馈：${title}`, html: `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(description).replace(/\n/g, '<br>')}</p><p><b>严重程度：</b>${escapeHtml(input.severity)}<br><b>页面：</b>${escapeHtml(input.pageUrl.split('?')[0])}<br><b>报告 ID：</b>${report.id}</p><p>${attachment ? '已附上经过脱敏的客户端诊断日志（网络、错误与点击轨迹）。' : '用户未附加客户端诊断日志。'}</p>`, attachments: attachment ? [{ filename: `bug-report-${report.id}-diagnostics.json`, content: attachment }] : undefined }) });
    if (!response.ok) { const detail = (await response.text()).slice(0, 500); console.error('[BugReport] Resend send failed', { reportId: report.id, status: response.status, detail }); return { success: true, mailSent: false, mailError: `邮件服务返回 HTTP ${response.status}` }; }
    return { success: true, mailSent: true };
  } catch (cause) { console.error('[BugReport] Resend request failed', { reportId: report.id, cause: cause instanceof Error ? cause.message : String(cause) }); return { success: true, mailSent: false, mailError: '邮件服务网络请求失败' }; }
}

export type UserBugReport = { id: string; title: string; severity: 'low' | 'normal' | 'high' | 'critical'; status: 'open' | 'in_progress' | 'resolved' | 'closed'; created_at: string; updated_at: string };
export async function getMyBugReports(): Promise<UserBugReport[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from('bug_reports').select('id, title, severity, status, created_at, updated_at').order('updated_at', { ascending: false }).limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as UserBugReport[];
}
export async function getMyTicketMessages(reportId: string): Promise<TicketMessage[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from('support_replies').select('id, body, author_id, created_at, updated_at').eq('report_id', reportId).order('created_at');
  if (error) throw new Error(error.message);
  // The client only needs an ownership marker to decide whether to show Edit;
  // do not serialize its real auth user id into the support transcript.
  return (data ?? []).map((entry) => ({ ...entry, author_id: entry.author_id === user.id ? reportId : entry.author_id, is_admin: entry.author_id !== user.id })) as TicketMessage[];
}
export async function addMyTicketMessage(reportId: string, body: string) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };
  const { error } = await supabase.from('support_replies').insert({ report_id: reportId, author_id: user.id, body: body.trim() });
  return error ? { success: false, error: error.message } : { success: true };
}
export async function editMyTicketMessage(messageId: string, body: string) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };
  const { data, error } = await supabase.from('support_replies').update({ body: body.trim(), updated_at: new Date().toISOString() }).eq('id', messageId).eq('author_id', user.id).select('id').maybeSingle();
  return error || !data ? { success: false, error: error?.message ?? '该消息无法修改' } : { success: true };
}

export type BugReport = { id: string; user_id: string; title: string; description: string; severity: 'low' | 'normal' | 'high' | 'critical'; status: 'open' | 'in_progress' | 'resolved' | 'closed'; page_url: string | null; created_at: string; updated_at: string; diagnostics: DiagnosticSnapshot | null };
export type TicketMessage = { id: string; body: string; author_id: string; is_admin?: boolean; author_name?: string; created_at: string; updated_at: string };
export type TicketDetail = { user: { id: string; email: string | null; display_name: string | null; avatar_url: string | null; created_at: string; account_status: string } | null; messages: TicketMessage[]; notes: { id: string; body: string; author_id: string; created_at: string }[]; events: { id: string; event_type: 'status_changed' | 'internal_note'; previous_status: string | null; next_status: string | null; created_at: string }[] };

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
