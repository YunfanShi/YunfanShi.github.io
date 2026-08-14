'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  addBugReportInternalNote,
  addTicketMessage,
  closeBugReport,
  deleteBugReport,
  editTicketMessage,
  getAdminBugReports,
  getBugReportDetail,
  resolveAccountAppeal,
  updateBugReportStatus,
  type BugReport,
  type TicketDetail,
  type TicketMessage,
} from '@/actions/feedback';

const statuses = [['open', '开放'], ['in_progress', '处理中'], ['resolved', '已解决'], ['closed', '已关闭']] as const;
const names: Record<string, string> = { low: '轻微', normal: '普通', high: '严重', critical: '紧急', open: '开放', in_progress: '处理中', resolved: '已解决', closed: '已结束' };
const colours: Record<string, string> = { open: 'bg-blue-50 text-[#175cd3]', in_progress: 'bg-[#fffaeb] text-[#b54708]', resolved: 'bg-[#ecfdf3] text-[#027a48]', closed: 'bg-slate-100 text-[#475467]' };
const ticketLabels: Record<BugReport['ticket_type'], string> = { bug: 'Bug 反馈', suggestion: '网站建议', usage_help: '使用帮助', account_security: '账号安全协助', suspension_appeal: '暂停申诉', deletion_recovery: '账号恢复' };
const isAppealTicket = (type: BugReport['ticket_type']) => type === 'suspension_appeal' || type === 'deletion_recovery';
const stamp = (value: string) => new Date(value).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" onClick={() => navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {})} className="rounded-md px-2 py-1 text-xs text-[#155eef] hover:bg-[#eff4ff]">{copied ? '已复制' : '复制'}</button>;
}

function MessageCard({ message, editable, onEdit }: { message: TicketMessage; editable: boolean; onEdit: (id: string, body: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(message.body);
  return (
    <article className={`max-w-[88%] rounded-2xl p-3 text-sm ${message.is_admin ? 'ml-auto rounded-br-md bg-[#155eef] text-white' : 'rounded-bl-md bg-[#f2f4f7] dark:bg-white/10'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold">{message.is_admin ? '支持团队' : message.author_name || '用户'}</p>
        <div className="flex items-center">{editable && <button type="button" onClick={() => setEditing((value) => !value)} className={`rounded-md px-2 py-1 text-xs ${message.is_admin ? 'text-white/80 hover:bg-white/10' : 'text-[#155eef]'}`}>{editing ? '取消' : '编辑'}</button>}</div>
      </div>
      {editing ? <><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-white/25 bg-white p-2 text-sm text-[#182230]" /><button type="button" disabled={!body.trim() || body.trim() === message.body} onClick={() => { onEdit(message.id, body); setEditing(false); }} className="mt-2 rounded-md bg-white px-2 py-1 text-xs font-semibold text-[#155eef] disabled:opacity-50">保存修改</button></> : <p className="mt-2 whitespace-pre-wrap leading-6">{message.body}</p>}
      <p className={`mt-2 text-[10px] ${message.is_admin ? 'text-white/65' : 'text-[#667085]'}`}>{stamp(message.created_at)}{message.updated_at !== message.created_at ? ' · 已编辑' : ''}</p>
    </article>
  );
}

export default function BugReportsPanel({ reports, initialTicketId }: { reports: BugReport[]; initialTicketId?: string }) {
  const [items, setItems] = useState(reports);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'active' | BugReport['status']>('active');
  const [selectedId, setSelectedId] = useState(initialTicketId && reports.some((report) => report.id === initialTicketId) ? initialTicketId : reports[0]?.id);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();
  const selected = items.find((item) => item.id === selectedId);
  const visible = useMemo(() => items.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'active' ? item.status !== 'closed' : item.status === filter)), [items, query, filter]);

  const load = useCallback((id: string) => startTransition(async () => { try { setDetail(await getBugReportDetail(id)); } catch { setNotice('无法加载工单详情。'); } }), [startTransition]);
  useEffect(() => { if (selectedId) load(selectedId); }, []);
  const refreshTickets = useCallback(() => startTransition(async () => {
    try {
      const next = await getAdminBugReports();
      setItems(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id);
      if (selectedId && next.some((item) => item.id === selectedId)) setDetail(await getBugReportDetail(selectedId));
    } catch {
      setNotice('自动刷新工单失败，请稍后重试。');
    }
  }), [selectedId, startTransition]);
  useEffect(() => {
    const timer = window.setInterval(refreshTickets, 20_000);
    return () => window.clearInterval(timer);
  }, [refreshTickets]);
  const select = (id: string) => { setSelectedId(id); setDetail(null); setNotice(''); load(id); };
  const updateItem = (next: Partial<BugReport>) => selected && setItems((all) => all.map((item) => item.id === selected.id ? { ...item, ...next, updated_at: new Date().toISOString() } : item));
  const status = (next: BugReport['status']) => { if (!selected) return; startTransition(async () => { const result = await updateBugReportStatus(selected.id, next); if (!result.success) return setNotice(result.error ?? '状态更新失败。'); updateItem({ status: next }); load(selected.id); }); };
  const send = () => { if (!selected || !draft.trim()) return; startTransition(async () => { const result = await addTicketMessage(selected.id, draft); if (!result.success) return setNotice(result.error ?? '发送失败。'); setDraft(''); updateItem({ status: selected.status === 'open' ? 'in_progress' : selected.status }); setNotice('消息已发送，并已推送到用户的消息中心。'); load(selected.id); }); };
  const edit = (messageId: string, body: string) => startTransition(async () => { const result = await editTicketMessage(messageId, body); if (!result.success) return setNotice(result.error ?? '保存失败。'); if (selected) load(selected.id); });
  const saveNote = () => { if (!selected || !note.trim()) return; startTransition(async () => { const result = await addBugReportInternalNote(selected.id, note); if (!result.success) return setNotice(result.error ?? '备注保存失败。'); setNote(''); load(selected.id); }); };
  const close = () => { if (!selected) return; const result = prompt('请填写给用户的处理结果（此内容会发送到消息中心）：'); if (!result?.trim()) return; startTransition(async () => { const response = await closeBugReport(selected.id, result); if (!response.success) return setNotice(response.error ?? '结束失败。'); updateItem({ status: 'closed' }); setNotice('工单已结束，处理结果已发送给用户。'); load(selected.id); }); };
  const decideAppeal = (approved: boolean) => { if (!selected || !isAppealTicket(selected.ticket_type)) return; const action = selected.ticket_type === 'suspension_appeal' ? '取消账户暂停' : '恢复注销账户'; const response = prompt(approved ? `将${action}。请输入给用户的处理说明：` : '请输入驳回原因和后续建议：'); if (!response?.trim()) return; startTransition(async () => { const result = await resolveAccountAppeal(selected.id, approved, response); if (!result.success) return setNotice(result.error ?? '申诉处理失败。'); updateItem({ status: 'closed' }); setNotice(approved ? `申诉已批准，已${action}。` : '申诉已驳回，处理说明已发送给用户。'); load(selected.id); }); };
  const remove = () => { if (!selected || !confirm(`确定永久删除工单「${selected.title}」吗？`)) return; startTransition(async () => { const result = await deleteBugReport(selected.id); if (!result.success) return setNotice(result.error ?? '删除失败。'); const remaining = items.filter((item) => item.id !== selected.id); setItems(remaining); setSelectedId(remaining[0]?.id); setDetail(null); setNotice('工单已删除。'); }); };

  return (
    <div className="grid min-h-[680px] gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-2xl border border-[#eaecf0] dark:border-white/10">
        <div className="space-y-2 border-b border-[#eaecf0] p-3 dark:border-white/10"><div className="flex items-center justify-between"><p className="text-xs text-[#667085]">每 20 秒自动刷新</p><button type="button" onClick={refreshTickets} disabled={pending} className="text-xs font-medium text-[#155eef] disabled:opacity-50">刷新</button></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工单" className="h-10 w-full rounded-lg border border-[#d0d5dd] bg-transparent px-3 text-sm" /><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="w-full rounded-lg border border-[#d0d5dd] bg-transparent px-2 py-2 text-xs"><option value="active">未结束工单</option>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="max-h-[590px] divide-y divide-[#eaecf0] overflow-y-auto dark:divide-white/10">{visible.map((item) => <button key={item.id} onClick={() => select(item.id)} className={`w-full px-4 py-3 text-left ${selectedId === item.id ? 'bg-[#eff4ff] dark:bg-[#155eef]/15' : 'hover:bg-[#f9fafb] dark:hover:bg-white/5'}`}><div className="flex gap-2"><p className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</p><span className={`rounded-full px-2 py-0.5 text-[10px] ${colours[item.status]}`}>{names[item.status]}</span></div><div className="mt-1 flex items-center gap-2"><span className="rounded bg-[#f2f4f7] px-1.5 py-0.5 text-[10px] text-[#475467]">{ticketLabels[item.ticket_type]}</span><p className="line-clamp-1 text-xs text-[#667085]">{item.description}</p></div></button>)}{!visible.length && <p className="p-8 text-center text-sm text-[#667085]">没有符合条件的工单</p>}</div>
      </aside>

      <section className="rounded-2xl border border-[#eaecf0] p-5 dark:border-white/10">
        {selected ? <>
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eaecf0] pb-4 dark:border-white/10">
            <div><div className="flex gap-2"><span className={`rounded-full px-2 py-1 text-xs ${colours[selected.status]}`}>{names[selected.status]}</span><span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-xs text-[#475467]">{ticketLabels[selected.ticket_type]}</span></div><h2 className="mt-3 text-xl font-semibold">{selected.title}</h2><p className="mt-1 text-xs text-[#667085]">{names[selected.severity]} · 创建于 {stamp(selected.created_at)}</p></div>
            <div className="flex flex-wrap gap-2">
              {isAppealTicket(selected.ticket_type) && selected.status !== 'closed' && <><button type="button" disabled={pending} onClick={() => decideAppeal(true)} className="rounded-lg bg-[#079455] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{selected.ticket_type === 'suspension_appeal' ? '批准并取消暂停' : '批准恢复账号'}</button><button type="button" disabled={pending} onClick={() => decideAppeal(false)} className="rounded-lg border border-[#fecdca] px-3 py-2 text-sm font-semibold text-[#b42318] disabled:opacity-50">驳回申诉</button></>}
              <select value={selected.status} disabled={pending || selected.status === 'closed'} onChange={(event) => status(event.target.value as BugReport['status'])} className="rounded-lg border border-[#d0d5dd] bg-transparent px-2 text-sm">{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              {!isAppealTicket(selected.ticket_type) && <button type="button" disabled={pending || selected.status === 'closed'} onClick={close} className="rounded-lg bg-[#155eef] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">结束工单</button>}
              <button type="button" disabled={pending} onClick={remove} className="rounded-lg border border-[#fecdca] px-3 py-2 text-sm font-semibold text-[#b42318] disabled:opacity-50">删除</button>
            </div>
          </header>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <main>
              <div className="rounded-xl bg-[#f9fafb] p-4 dark:bg-white/5"><p className="whitespace-pre-wrap text-sm leading-6">{selected.description}</p></div>
              <h3 className="mt-5 text-sm font-semibold">客服对话</h3>
              <div className="mt-3 flex min-h-56 flex-col gap-3 rounded-2xl bg-[#f9fafb] p-4 dark:bg-white/5">{detail?.messages.map((message) => <MessageCard key={message.id} message={message} editable={Boolean(message.is_admin)} onEdit={edit} />) || <p className="text-sm text-[#667085]">正在加载沟通记录…</p>}</div>
              <textarea value={draft} disabled={selected.status === 'closed'} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder="发送后会立即提醒用户，并显示在右上角消息中心" className="mt-4 w-full rounded-xl border border-[#d0d5dd] bg-transparent p-3 text-sm disabled:opacity-50" />
              <button disabled={pending || selected.status === 'closed' || !draft.trim()} onClick={send} className="mt-2 rounded-lg bg-[#155eef] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">发送消息</button>
            </main>
            <aside className="space-y-4">
              <article className="rounded-xl border border-[#eaecf0] p-4 dark:border-white/10"><h3 className="font-semibold">用户资料</h3>{detail?.user ? <div className="mt-3 space-y-2 text-sm"><p className="font-medium">{detail.user.display_name || '未命名用户'}</p><p className="break-all text-[#667085]">{detail.user.email || detail.user.id}</p><p className="text-xs text-[#667085]">注册：{stamp(detail.user.created_at)}</p><p className="text-xs text-[#667085]">状态：{detail.user.deleted_at ? '待恢复' : detail.user.account_status}</p>{detail.user.suspended_reason && <div className="rounded-lg bg-[#fffaeb] p-2 text-xs text-[#93370d]"><strong>{detail.user.suspended_reason}</strong>{detail.user.suspended_explanation && <p className="mt-1 whitespace-pre-wrap">{detail.user.suspended_explanation}</p>}</div>}<CopyButton value={detail.user.email || detail.user.id} /></div> : <p className="mt-2 text-sm text-[#667085]">加载中…</p>}</article>
              <details className="rounded-xl bg-[#f9fafb] p-4 text-xs dark:bg-white/5"><summary className="cursor-pointer font-semibold">诊断日志</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{selected.diagnostics ? JSON.stringify(selected.diagnostics, null, 2) : '用户未附加诊断日志。'}</pre></details>
              <article><h3 className="text-sm font-semibold">内部备注</h3>{detail?.notes.map((entry) => <div key={entry.id} className="mt-2 rounded-lg border border-dashed border-[#d0d5dd] p-3 text-xs"><p className="whitespace-pre-wrap">{entry.body}</p><p className="mt-2 text-[#667085]">{stamp(entry.created_at)}</p></div>)}<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="仅管理员可见" className="mt-3 w-full rounded-lg border border-[#d0d5dd] bg-transparent p-3 text-sm" /><button disabled={pending || !note.trim()} onClick={saveNote} className="mt-2 rounded-lg border border-[#d0d5dd] px-3 py-2 text-sm font-semibold disabled:opacity-50">保存备注</button></article>
            </aside>
          </div>
          {notice && <p role="status" className="mt-4 rounded-lg bg-[#eff8ff] px-3 py-2 text-sm text-[#175cd3]">{notice}</p>}
        </> : <div className="grid min-h-80 place-items-center text-sm text-[#667085]">从左侧选择一个工单查看详情。</div>}
      </section>
    </div>
  );
}
