'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { addMyTicketMessage, getMyRemoteAssistanceRequest, getMyTicketConversation, respondRemoteAssistance, type MyTicketConversation } from '@/actions/feedback';

interface Props {
  ticketId: string;
  fallbackTitle?: string;
  onClose: () => void;
}

const stamp = (value: string) => new Date(value).toLocaleString('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default function SupportConversationDialog({ ticketId, fallbackTitle = '客服对话', onClose }: Props) {
  const [conversation, setConversation] = useState<MyTicketConversation | null>(null);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [remoteRequest, setRemoteRequest] = useState<{ id: string; status: 'requested' | 'approved' | 'denied' | 'revoked' | 'expired' } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    getMyTicketConversation(ticketId)
      .then((value) => {
        setConversation(value);
        getMyRemoteAssistanceRequest(ticketId).then(setRemoteRequest).catch(() => {});
        if (!value) setNotice('无法读取这条客服对话。');
      })
      .catch(() => setNotice('对话加载失败，请稍后重试。'));
  }, [ticketId]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 20_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [conversation?.messages.length]);
  useEffect(() => { if (conversation?.status === 'closed') onClose(); }, [conversation?.status, onClose]);

  const send = () => {
    if (!draft.trim() || !conversation || conversation.status === 'closed') return;
    const body = draft.trim();
    startTransition(async () => {
      const result = await addMyTicketMessage(ticketId, body);
      if (!result.success) {
        setNotice(result.error ?? '消息发送失败。');
        return;
      }
      setDraft('');
      setNotice('');
      refresh();
    });
  };
  const respondRemote = (approved: boolean) => {
    if (!remoteRequest) return;
    startTransition(async () => { const result = await respondRemoteAssistance(remoteRequest.id, approved); if (!result.success) return setNotice(result.error ?? '授权操作失败。'); setRemoteRequest((current) => current ? { ...current, status: approved ? 'approved' : 'denied' } : null); });
  };

  if (minimized) return <button type="button" onClick={() => setMinimized(false)} className="fixed bottom-5 right-5 z-[120] flex items-center gap-2 rounded-full bg-[#155eef] px-4 py-3 text-sm font-semibold text-white shadow-2xl"><span className="material-icons-round">support_agent</span>客服对话</button>;
  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-[#101828]/35 p-3 backdrop-blur-[1px] sm:p-5" onClick={() => setMinimized(true)}>
      <section className="flex h-[calc(100vh-1.5rem)] w-full max-w-[960px] flex-col overflow-hidden rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl sm:h-[calc(100vh-2.5rem)]" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#155eef] text-white">
              <span className="material-icons-round text-xl">support_agent</span>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate font-semibold text-[var(--foreground)]">{conversation?.title ?? fallbackTitle}</h2>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${conversation?.status === 'closed' ? 'bg-slate-100 text-slate-600' : 'bg-[#ecfdf3] text-[#027a48]'}`}>
                  {conversation?.status === 'closed' ? '已结束' : '处理中'}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">JackYun 客服中心 · 对话记录会保存在工单中</p>
            </div>
          </div>
          <button type="button" aria-label="最小化客服对话" title="最小化，工单结束后将自动隐藏" onClick={() => setMinimized(true)} className="grid h-9 w-9 place-items-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--background)]">
            <span className="material-icons-round">minimize</span>
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto bg-[var(--background)]/60 px-4 py-5 sm:px-6">
          {!conversation && !notice && <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">正在载入对话…</p>}
          {conversation?.messages.filter((message) => message.message_kind !== 'resolution').map((message) => (
            <div key={message.id} className={`flex ${message.is_admin ? 'justify-start' : 'justify-end'}`}>
              <article className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${message.is_admin ? 'rounded-bl-md border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)]' : 'rounded-br-md bg-[#155eef] text-white'}`}>
                <p className={`mb-1 text-[11px] font-semibold ${message.is_admin ? 'text-[#155eef]' : 'text-white/75'}`}>{message.is_admin ? '支持团队' : '我'}</p>
                {message.body.startsWith('[导航协助]') ? <NavigationCard body={message.body} /> : <p className="whitespace-pre-wrap leading-6">{message.body}</p>}
                <p className={`mt-2 text-[10px] ${message.is_admin ? 'text-[var(--muted-foreground)]' : 'text-white/65'}`}>{stamp(message.created_at)}</p>
              </article>
            </div>
          ))}
          {conversation?.messages.filter((message) => message.message_kind === 'resolution').map((message) => (
            <article key={message.id} className="overflow-hidden rounded-2xl border border-[#fecdca] bg-[#fffbfa] shadow-sm"><div className="flex items-center gap-2 bg-[#fef3f2] px-4 py-3 text-sm font-semibold text-[#b42318]"><span className="material-icons-round text-lg">task_alt</span>系统处理结果：{message.system_result ?? '本次人工客服咨询已结束'}</div><div className="border-t border-[#fecdca] px-4 py-3"><p className="text-xs font-semibold text-[#b54708]">管理员处理说明</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#344054]">{message.body}</p><p className="mt-2 text-[10px] text-[#667085]">{stamp(message.created_at)}</p></div></article>
          ))}
          {remoteRequest?.status === 'requested' && <article className="rounded-2xl border border-[#b2ddff] bg-[#eff8ff] p-4"><p className="font-semibold text-[#175cd3]">管理员请求远程协助</p><p className="mt-2 text-sm leading-6 text-[#344054]">授权后管理员仅能查看脱敏配置状态、偏好和诊断日志；无法读取或写入密码、API Key、私密内容。授权将在 30 分钟后自动失效。</p><div className="mt-3 flex gap-2"><button disabled={pending} onClick={() => respondRemote(true)} className="rounded-lg bg-[#155eef] px-3 py-2 text-sm font-semibold text-white">允许协助</button><button disabled={pending} onClick={() => respondRemote(false)} className="rounded-lg border border-[#b2ddff] px-3 py-2 text-sm font-semibold text-[#175cd3]">拒绝</button></div></article>}
          {remoteRequest?.status === 'approved' && <p className="rounded-xl bg-[#ecfdf3] px-4 py-3 text-center text-sm text-[#027a48]">你已授权远程协助；授权将在 30 分钟后自动失效。</p>}
          <div ref={bottomRef} />
        </div>

        <footer className="border-t border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5">
          {notice && <p role="status" className="mb-3 rounded-lg bg-[#fff4ed] px-3 py-2 text-xs text-[#b93815]">{notice}</p>}
          {conversation?.status === 'closed' ? (
            <p className="rounded-xl bg-[var(--background)] px-4 py-3 text-center text-sm text-[var(--muted-foreground)]">该工单已结束，对话记录仍可查看。</p>
          ) : (
            <div className="flex items-end gap-3">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} rows={2} placeholder="输入消息，Enter 发送，Shift + Enter 换行" className="min-h-12 flex-1 resize-none rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-sm outline-none focus:border-[#155eef] focus:ring-2 focus:ring-[#155eef]/15" />
              <button type="button" disabled={pending || !draft.trim() || !conversation} onClick={send} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#155eef] text-white shadow-sm transition hover:bg-[#004eeb] disabled:opacity-40" aria-label="发送消息">
                <span className="material-icons-round">send</span>
              </button>
            </div>
          )}
        </footer>
      </section>
    </div>
  );
}

function NavigationCard({ body }: { body: string }) {
  const [path = '/dashboard', label = '工作台'] = body.slice('[导航协助]'.length).split('|');
  const allowed = ['/dashboard', '/settings', '/study-guide', '/timetable-hub'];
  if (!allowed.includes(path)) return <p>管理员发送了一条页面协助指令。</p>;
  return <div><p>管理员建议你打开“{label}”。</p><button type="button" onClick={() => { window.location.assign(path); }} className="mt-3 rounded-lg bg-[#155eef] px-3 py-2 text-sm font-semibold text-white">打开{label}</button></div>;
}
