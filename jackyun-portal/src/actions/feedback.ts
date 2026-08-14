'use server';
import { createClient } from '@/lib/supabase/server';

export async function submitBugReport(input: { title: string; description: string; severity: 'low' | 'normal' | 'high' | 'critical'; pageUrl: string }) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '请先登录' };
  const { error } = await supabase.from('bug_reports').insert({ user_id: user.id, title: input.title.trim(), description: input.description.trim(), severity: input.severity, page_url: input.pageUrl });
  if (error) return { success: false, error: error.message };
  const key = process.env.RESEND_API_KEY;
  if (key) await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL ?? 'JackYun Portal <onboarding@resend.dev>', to: ['w.jack2025a@gmail.com'], subject: `Bug 反馈：${input.title.trim()}`, html: `<h2>${input.title.trim()}</h2><p>${input.description.trim().replace(/</g, '&lt;')}</p><p>严重程度：${input.severity}<br>页面：${input.pageUrl}</p>` }) }).catch(() => {});
  return { success: true };
}

export type BugReport = { id: string; title: string; description: string; severity: string; status: string; page_url: string | null; created_at: string };
export async function getAdminBugReports(): Promise<BugReport[]> { const supabase = await createClient(); const { data, error } = await supabase.rpc('admin_list_bug_reports'); if (error) throw new Error(error.message); return (data ?? []) as BugReport[]; }
export async function replyToBugReport(id: string, body: string, status: string) { const supabase = await createClient(); const { error } = await supabase.rpc('admin_reply_bug_report', { p_report_id: id, p_body: body, p_status: status }); return error ? { success: false, error: error.message } : { success: true }; }
