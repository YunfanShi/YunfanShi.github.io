'use server';

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

export type BugReport = { id: string; title: string; description: string; severity: string; status: string; page_url: string | null; created_at: string; diagnostics: DiagnosticSnapshot | null };
export async function getAdminBugReports(): Promise<BugReport[]> { const supabase = await createClient(); const { data, error } = await supabase.rpc('admin_list_bug_reports'); if (error) throw new Error(error.message); return (data ?? []) as BugReport[]; }
export async function replyToBugReport(id: string, body: string, status: string) { const supabase = await createClient(); const { error } = await supabase.rpc('admin_reply_bug_report', { p_report_id: id, p_body: body, p_status: status }); return error ? { success: false, error: error.message } : { success: true }; }
