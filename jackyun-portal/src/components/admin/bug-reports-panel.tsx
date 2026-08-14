'use client';

import { useEffect, useState, useTransition } from 'react';
import { addTicketMessage, closeBugReport, exportTicketUserData, getAdminBugReports, getBugReportDetail, getRemoteAssistanceSnapshot, repairTicketPreferences, requestRemoteAssistance, restoreTicketUserAccount, updateBugReportType, updateRemoteAssistancePreference, type BugReport, type TicketDetail } from '@/actions/feedback';

const types: { value: BugReport['ticket_type']; label: string }[] = [
  { value: 'bug', label: 'Bug 反馈' }, { value: 'suggestion', label: '网站建议' }, { value: 'usage_help', label: '使用帮助' }, { value: 'account_security', label: '账号安全协助' }, { value: 'suspension_appeal', label: '暂停申诉' }, { value: 'deletion_recovery', label: '账号恢复' },
];
const auditLabels: Record<string, string> = { remote_assistance_requested: '管理员发起远程协助授权请求', remote_assistance_approved: '用户同意远程协助', remote_assistance_denied: '用户拒绝远程协助', remote_snapshot_viewed: '查看脱敏远程协助快照', remote_preference_updated: '修改用户非敏感偏好', user_data_exported: '导出用户数据备份', deleted_account_restored: '恢复误删账户与保留数据', visual_preferences_repaired: '修复异常视觉偏好数据' };
type Snapshot = { preferences: Record<string, Record<string, string>> | null };

export default function BugReportsPanel({ reports, initialTicketId }: { reports: BugReport[]; initialTicketId?: string }) {
  const [items, setItems] = useState(reports);
  const [id, setId] = useState(initialTicketId ?? reports[0]?.id);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = items.find((item) => item.id === id);

  const load = async () => {
    const next = await getAdminBugReports();
    setItems(next);
    if (id) setDetail(await getBugReportDetail(id));
  };
  useEffect(() => { load().catch(() => setNotice('无法加载工单。')); const timer = setInterval(() => load().catch(() => {}), 20_000); return () => clearInterval(timer); }, [id]);

  const run = (operation: () => Promise<{ success: boolean; error?: string }>, successMessage: string) => startTransition(async () => {
    const result = await operation();
    setNotice(result.success ? successMessage : result.error ?? '操作失败，请稍后重试。');
    if (result.success) await load();
  });
  const send = () => id && draft.trim() && startTransition(async () => {
    const result = await addTicketMessage(id, draft.trim());
    if (!result.success) return setNotice(result.error ?? '发送失败，请稍后重试。');
    setDraft(''); await load();
  });
  const exportData = () => id && startTransition(async () => {
    const result = await exportTicketUserData(id);
    if (!result.success || !result.archive) return setNotice(result.error ?? '导出失败，请稍后重试。');
    const url = URL.createObjectURL(new Blob([JSON.stringify(result.archive, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `ticket-${id}-user-backup.json`; link.click(); URL.revokeObjectURL(url);
    setNotice('数据备份已下载；其中不包含 AI API Key。'); await load();
  });
  const updatePreference = (key: 'language_preference' | 'theme_preference' | 'sidebar_preferences', value: Record<string, string>) => sessionId && run(() => updateRemoteAssistancePreference(sessionId, key, value), '偏好已更新，操作已写入审计记录。');

  return <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
    <aside className="overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)]">
      <p className="border-b border-[var(--card-border)] px-4 py-3 text-xs text-[var(--muted-foreground)]">工单每 20 秒自动刷新</p>
      <div className="max-h-[calc(100vh-290px)] overflow-y-auto">{items.map((item) => <button key={item.id} onClick={() => { setId(item.id); setSessionId(null); setSnapshot(null); setNotice(''); }} className={`block w-full border-b border-[var(--card-border)] p-4 text-left transition ${id === item.id ? 'bg-[#155eef]/15 text-[var(--foreground)]' : 'hover:bg-[var(--background)]'}`}><b className="block truncate text-sm">{item.title}</b><span className="mt-1 block text-xs text-[var(--muted-foreground)]">{types.find((type) => type.value === item.ticket_type)?.label} · {item.status}</span></button>)}</div>
    </aside>
    <main className="min-w-0 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 lg:p-6">
      {!selected ? <p className="py-16 text-center text-sm text-[var(--muted-foreground)]">暂无工单</p> : <>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--card-border)] pb-5"><div><h2 className="text-xl font-bold">{selected.title}</h2><p className="mt-1 text-sm text-[var(--muted-foreground)]">状态：{selected.status}</p></div><div className="flex flex-wrap gap-2"><select aria-label="工单类型" value={selected.ticket_type} disabled={pending} onChange={(event) => run(() => updateBugReportType(selected.id, event.target.value as BugReport['ticket_type']), '工单类型已更新。')} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"><>{types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</></select><button disabled={pending || selected.status === 'closed'} onClick={() => { const message = prompt('管理员处理说明：'); if (message?.trim()) run(() => closeBugReport(selected.id, message), '工单已结束。'); }} className="rounded-lg bg-[#155eef] px-3 py-2 text-sm font-semibold text-white hover:bg-[#004eeb] disabled:opacity-50">结束工单</button></div></header>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0"><article className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4 text-sm leading-6 whitespace-pre-wrap">{selected.description}</article><h3 className="mt-5 font-semibold">客服对话</h3><div className="mt-3 min-h-56 space-y-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">{detail?.messages.length ? detail.messages.map((message) => message.message_kind === 'resolution' ? <article key={message.id} className="overflow-hidden rounded-xl border border-[#fecdca] bg-[#fffbfa] text-[#344054]"><p className="bg-[#fef3f2] px-3 py-2 text-sm font-semibold text-[#b42318]">系统处理结果：{message.system_result ?? '本次工单已结束'}</p><div className="p-3"><p className="text-xs font-semibold text-[#b54708]">管理员处理说明</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.body}</p></div></article> : <article key={message.id} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.is_admin ? 'ml-auto bg-[#155eef] text-white' : 'border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)]'}`}><p className={`text-xs font-semibold ${message.is_admin ? 'text-white/75' : 'text-[#155eef]'}`}>{message.is_admin ? '管理员' : message.author_name || '用户'}</p><p className="mt-1 whitespace-pre-wrap">{message.body}</p></article>) : <p className="py-12 text-center text-sm text-[var(--muted-foreground)]">暂无回复</p>}</div><div className="mt-3"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} disabled={pending || selected.status === 'closed'} rows={3} className="w-full resize-y rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[#155eef] focus:outline-none focus:ring-2 focus:ring-[#155eef]/20 disabled:opacity-50" placeholder="回复用户。Enter 发送，Shift + Enter 换行" /><div className="mt-2 flex items-center justify-between gap-3"><p className="text-xs text-[var(--muted-foreground)]">Enter 发送 · Shift + Enter 换行</p><button onClick={send} disabled={pending || !draft.trim() || selected.status === 'closed'} className="rounded-lg bg-[#155eef] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004eeb] disabled:opacity-50">发送</button></div></div></section>
          <aside className="space-y-4"><section className="rounded-xl border border-[#b2ddff] bg-[#eff8ff] p-4 text-[#101828]"><h3 className="font-semibold text-[#175cd3]">远程协助</h3><p className="mt-2 text-xs leading-5 text-[#475467]">仅在用户有效授权后可查看或修改语言、主题和侧边栏偏好。密码、API Key 与私密内容始终不可见、不可修改。</p><button onClick={() => startTransition(async () => { const result = await requestRemoteAssistance(selected.id); if (!result.success) return setNotice(result.error ?? '请求失败。'); setSessionId(result.sessionId ?? null); setSnapshot(null); setNotice('授权请求已发送给用户。'); await load(); })} disabled={pending || selected.status === 'closed'} className="mt-3 w-full rounded-lg bg-[#155eef] px-3 py-2 text-sm font-semibold text-white hover:bg-[#004eeb] disabled:opacity-50">请求用户授权</button>{sessionId && <button onClick={() => startTransition(async () => { const result = await getRemoteAssistanceSnapshot(sessionId); if (!result.success) return setNotice(result.error ?? '尚未获得授权或授权已过期。'); setSnapshot(result.snapshot ?? null); await load(); })} disabled={pending} className="mt-2 w-full rounded-lg border border-[#84adff] bg-white px-3 py-2 text-sm font-semibold text-[#175cd3]">查看并编辑偏好</button>}{snapshot?.preferences && <div className="mt-3 space-y-3"><label className="block text-xs font-medium">语言<select defaultValue={snapshot.preferences.language_preference?.language ?? 'zh'} onChange={(event) => updatePreference('language_preference', { language: event.target.value })} className="mt-1 w-full rounded border border-[#b2ddff] bg-white p-2 text-sm"><option value="zh">中文</option><option value="en">English</option></select></label><label className="block text-xs font-medium">主题<select defaultValue={snapshot.preferences.theme_preference?.theme ?? 'light'} onChange={(event) => updatePreference('theme_preference', { theme: event.target.value })} className="mt-1 w-full rounded border border-[#b2ddff] bg-white p-2 text-sm"><option value="light">亮色</option><option value="gray">灰色</option><option value="dark">深色</option></select></label><button onClick={() => updatePreference('sidebar_preferences', { musicMode: 'player', answerSheetMode: 'standard' })} disabled={pending} className="w-full rounded border border-[#84adff] bg-white px-3 py-2 text-sm text-[#175cd3]">恢复默认侧边栏</button></div>}</section><section className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4"><h3 className="font-semibold">工单内数据操作</h3><p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">操作结果会写入审计记录；导出不包含 AI API Key。</p><div className="mt-3 grid gap-2"><button onClick={exportData} disabled={pending} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm hover:bg-[#155eef]/10 disabled:opacity-50">导出用户数据</button><button onClick={() => run(() => restoreTicketUserAccount(selected.id), '误删账户与保留数据已恢复。')} disabled={pending || !detail?.user?.deleted_at} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm hover:bg-[#155eef]/10 disabled:opacity-50">恢复误删账户数据</button><button onClick={() => run(() => repairTicketPreferences(selected.id), '异常视觉偏好已修复。')} disabled={pending} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-sm hover:bg-[#155eef]/10 disabled:opacity-50">修复异常偏好数据</button></div></section></aside>
        </div>
        <section className="mt-5 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4"><h3 className="font-semibold">远程协助与数据操作审计</h3>{detail?.operation_audit?.length ? <ol className="mt-3 space-y-2">{detail.operation_audit.map((entry) => <li key={entry.id} className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 text-sm"><p>{auditLabels[entry.operation] ?? entry.operation}</p><time className="mt-1 block text-xs text-[var(--muted-foreground)]">{new Date(entry.created_at).toLocaleString('zh-CN')}</time></li>)}</ol> : <p className="mt-2 text-sm text-[var(--muted-foreground)]">尚无远程协助或数据操作记录。</p>}</section>
        {notice && <p role="status" className="mt-4 rounded-lg border border-[#b2ddff] bg-[#eff8ff] p-3 text-sm text-[#175cd3]">{notice}</p>}
      </>}
    </main>
  </div>;
}
