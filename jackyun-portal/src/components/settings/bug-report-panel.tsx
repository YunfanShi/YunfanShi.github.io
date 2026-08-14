'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { getMyBugReports, submitBugReport, type CustomerSupportTicketType, type UserBugReport } from '@/actions/feedback';
import logger from '@/lib/logger';

const SupportConversationDialog = dynamic(() => import('@/components/modules/support-conversation-dialog'), { loading: () => null });
const statusName: Record<string, string> = { open: '已提交', in_progress: '处理中', resolved: '已解决', closed: '已结束' };
const statusStyle: Record<string, string> = { open: 'bg-blue-50 text-[#175cd3]', in_progress: 'bg-[#fffaeb] text-[#b54708]', resolved: 'bg-[#ecfdf3] text-[#027a48]', closed: 'bg-slate-100 text-[#475467]' };
const ticketTypes: { value: CustomerSupportTicketType; label: string; hint: string }[] = [
  { value: 'bug', label: 'Bug 反馈', hint: '报告网站错误、异常或无法使用的功能。' },
  { value: 'suggestion', label: '网站建议', hint: '提出新功能、优化体验或内容建议。' },
  { value: 'usage_help', label: '使用帮助', hint: '需要人工协助使用网站功能。' },
  { value: 'account_security', label: '账号安全协助', hint: '需要协助重置密码或处理账号安全问题。' },
];

export default function BugReportPanel() {
  const [ticketType, setTicketType] = useState<CustomerSupportTicketType>('bug');
  const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
  const [message, setMessage] = useState(''); const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<UserBugReport[]>([]); const [chatTicket, setChatTicket] = useState<UserBugReport | null>(null);
  const refresh = () => getMyBugReports().then(setReports).catch(() => {});
  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 20_000); return () => window.clearInterval(timer); }, []);
  const send = async () => { setLoading(true); setMessage(''); const result = await submitBugReport({ title, description, severity, ticketType, pageUrl: location.href, diagnostics: logger.getDiagnosticSnapshot() }); setMessage(result.success ? '人工客服咨询已提交。' : result.error ?? '提交失败'); if (result.success) { setTitle(''); setDescription(''); refresh(); } setLoading(false); };
  return <section className="rounded-[12px] border border-[var(--card-border)] bg-[var(--card)] p-5"><div className="mb-4 flex items-center gap-2"><span className="material-icons-round text-[#EA4335]">support_agent</span><h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">反馈与人工客服</h2></div><p className="mb-3 text-xs text-[var(--muted-foreground)]">提交后可与支持团队继续对话；Bug 类型会附上已脱敏的诊断日志。</p><div className="space-y-3"><label className="block text-sm font-medium text-[var(--foreground)]">咨询类型<select value={ticketType} onChange={(event) => setTicketType(event.target.value as CustomerSupportTicketType)} className="mt-1.5 w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm">{ticketTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><span className="mt-1 block text-xs font-normal text-[var(--muted-foreground)]">{ticketTypes.find((type) => type.value === ticketType)?.hint}</span></label><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="咨询标题" className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="请说明你的问题、建议或希望获得的帮助" rows={4} className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm" /><select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)} className="rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm"><option value="low">轻微</option><option value="normal">普通</option><option value="high">严重</option><option value="critical">紧急</option></select><button type="button" disabled={loading || title.trim().length < 3 || !description.trim()} onClick={send} className="ml-2 rounded-lg bg-[#EA4335] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{loading ? '提交中…' : '提交咨询'}</button>{message && <p className="text-sm text-[var(--muted-foreground)]">{message}</p>}</div><div className="mt-6 border-t border-[var(--card-border)] pt-4"><div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold text-[var(--foreground)]">人工客服记录</h3><p className="mt-1 text-xs text-[var(--muted-foreground)]">状态和对话会自动更新</p></div><button type="button" onClick={refresh} className="text-xs font-medium text-[#155eef]">刷新</button></div>{reports.length ? <div className="mt-3 divide-y divide-[var(--card-border)]">{reports.map((report) => <button type="button" key={report.id} onClick={() => setChatTicket(report)} className="w-full py-3 text-left"><div className="flex items-start gap-2"><p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--foreground)]">{report.title}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyle[report.status]}`}>{statusName[report.status]}</span></div><p className="mt-1 text-xs text-[var(--muted-foreground)]">最近更新：{new Date(report.updated_at).toLocaleString('zh-CN')}</p></button>)}</div> : <p className="mt-3 text-xs text-[var(--muted-foreground)]">尚未发起人工客服咨询。</p>}</div>{chatTicket && <SupportConversationDialog ticketId={chatTicket.id} fallbackTitle={chatTicket.title} onClose={() => { setChatTicket(null); refresh(); }} />}</section>;
}
