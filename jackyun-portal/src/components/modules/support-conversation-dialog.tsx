'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dismissTicketNotifications } from '@/actions/admin';
import { addMyTicketMessage, getMyRemoteAssistanceRequest, getMyTicketConversation, respondRemoteAssistance, type MyTicketConversation } from '@/actions/feedback';
import Link from 'next/link';
import { startVisiblePoll } from '@/lib/visible-poll';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription, getDialogContainer } from '@/components/ui/dialog';

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

export default function SupportConversationDialog(props: Props) {
  return <SupportConversation key={props.ticketId} {...props} />;
}

function SupportConversation({ ticketId, fallbackTitle = '客服对话', onClose }: Props) {
  const [conversation, setConversation] = useState<MyTicketConversation | null>(null);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [remoteRequest, setRemoteRequest] = useState<{ id: string; status: 'requested' | 'approved' | 'denied' | 'revoked' | 'expired' } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [opener] = useState(() => typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null);
  const [portalContainer] = useState(() => opener ? getDialogContainer(opener) : undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reopenRef = useRef<HTMLButtonElement>(null);
  const keepDraftRef = useRef<HTMLButtonElement>(null);
  const operationInFlight = useRef(false);
  const active = useRef(true);
  const generation = useRef(0);
  const acknowledged = useRef('');
  const invalidateRefresh = useCallback(() => { generation.current++; }, []);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; invalidateRefresh(); };
  }, [invalidateRefresh]);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const [value, remote] = await Promise.all([getMyTicketConversation(ticketId), getMyRemoteAssistanceRequest(ticketId)]);
      if (!active.current || request !== generation.current) return;
      if (value) setConversation(value);
      setRemoteRequest(remote);
      setLoadError(value ? '' : '无法读取这条客服对话。');
      const version = value ? `${ticketId}:${value.messages.map(message => `${message.id}:${message.updated_at}`).join(',')}` : '';
      if (value && version !== acknowledged.current) {
        const result = await dismissTicketNotifications(ticketId);
        if (active.current && request === generation.current && result.success) acknowledged.current = version;
      }
    } catch (error) {
      if (active.current && request === generation.current) setLoadError('对话加载失败，请重试。');
      throw error;
    }
  }, [ticketId]);

  useEffect(() => {
    if (minimized) return;
    const stop = startVisiblePoll(refresh);
    return () => { stop(); invalidateRefresh(); };
  }, [refresh, minimized, invalidateRefresh]);

  useEffect(() => {
    if (!minimized) (confirmingClose ? keepDraftRef : inputRef).current?.focus();
  }, [confirmingClose, minimized]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'false';
    bottomRef.current?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'nearest' });
  }, [conversation?.messages.length]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('jackyun:support-state', { detail: { ticketId, open: !minimized } }));
    return () => {
      window.dispatchEvent(new CustomEvent('jackyun:support-state', { detail: { ticketId, open: false } }));
    };
  }, [minimized, ticketId]);

  const send = async () => {
    if (operationInFlight.current || !draft.trim() || !conversation || conversation.status === 'closed') return;
    const body = draft.trim();
    const sentDraft = draft;
    operationInFlight.current = true;
    setPending(true);
    try {
      const result = await addMyTicketMessage(ticketId, body);
      if (!active.current) return;
      if (!result.success) {
        setNotice(result.error ?? '消息发送失败。');
        return;
      }
      setDraft(current => current === sentDraft ? '' : current);
      setNotice('');
      void refresh().catch(() => {});
    } catch {
      if (active.current) setNotice('消息发送失败，输入已保留，请重试。');
    } finally {
      operationInFlight.current = false;
      if (active.current) setPending(false);
    }
  };
  const respondRemote = async (approved: boolean) => {
    if (!remoteRequest || operationInFlight.current) return;
    operationInFlight.current = true;
    setPending(true);
    try {
      const result = await respondRemoteAssistance(remoteRequest.id, approved);
      if (!active.current) return;
      if (!result.success) return setNotice(result.error ?? '授权操作失败。');
      setNotice('');
      setRemoteRequest(current => current ? { ...current, status: approved ? 'approved' : 'denied' } : null);
    } catch {
      if (active.current) setNotice('授权操作失败，请重试。');
    } finally {
      operationInFlight.current = false;
      if (active.current) setPending(false);
    }
  };

  const close = () => {
    if (operationInFlight.current) return;
    if (draft.trim()) setConfirmingClose(true);
    else onClose();
  };
  return (
    <>
      {minimized && createPortal(<Button ref={reopenRef} onClick={() => setMinimized(false)} className="jy-support-restore"><span aria-hidden="true" className="material-icons-round">support_agent</span>客服对话</Button>, portalContainer ?? document.body)}
      <Dialog open={!minimized} onOpenChange={open => { if (!open && !operationInFlight.current) setMinimized(true); }}>
      <DialogContent hideCloseButton portalContainer={portalContainer} className="jy-support-dialog"
        onOpenAutoFocus={event => { event.preventDefault(); inputRef.current?.focus(); }}
        onCloseAutoFocus={event => { event.preventDefault(); const target = reopenRef.current ?? opener; if (target?.isConnected) target.focus(); }}
        onEscapeKeyDown={event => { if (operationInFlight.current || confirmingClose) { event.preventDefault(); if (!operationInFlight.current) setConfirmingClose(false); } }}
        onInteractOutside={event => { if (operationInFlight.current || confirmingClose) event.preventDefault(); }}>
        <header className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#155eef] text-white">
              <span className="material-icons-round text-xl">support_agent</span>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="truncate pr-0 text-base">{conversation?.title ?? fallbackTitle}</DialogTitle>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${conversation?.status === 'closed' ? 'bg-slate-100 text-slate-600' : 'bg-[#ecfdf3] text-[#027a48]'}`}>
                  {conversation?.status === 'closed' ? '已结束' : conversation ? '处理中' : loadError ? '加载失败' : '加载中'}
                </span>
              </div>
              <DialogDescription className="mt-0.5 text-xs">对话记录保存在工单中。Esc 可最小化并保留未发送内容。</DialogDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" disabled={pending} aria-label="最小化客服对话" title="最小化客服对话" onClick={() => setMinimized(true)}>
              <span className="material-icons-round">minimize</span>
            </Button>
            <Button variant="ghost" size="icon" disabled={pending} aria-label="关闭客服对话" title="关闭客服对话" onClick={close}>
              <span className="material-icons-round">close</span>
            </Button>
          </div>
        </header>

        <div role="region" aria-label="客服对话消息" aria-busy={!conversation && !loadError} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[var(--background)]/60 px-4 py-5 sm:px-6">
          {!conversation && !loadError && <p role="status" className="py-10 text-center text-sm text-[var(--muted-foreground)]">正在载入对话…</p>}
          {loadError && <div role="status"><p>{loadError}</p><Button variant="outline" onClick={() => refresh().catch(() => {})}>重新加载对话</Button></div>}
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
          {remoteRequest?.status === 'requested' && <article className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] p-4"><p className="font-semibold text-[var(--foreground)]">管理员请求远程协助</p><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">授权后管理员仅能查看脱敏配置状态、偏好和诊断日志；无法读取或写入密码、API Key、私密内容。授权将在 30 分钟后自动失效。</p><div className="mt-3 flex gap-2"><Button disabled={pending} onClick={() => respondRemote(true)}>允许协助</Button><Button variant="outline" disabled={pending} onClick={() => respondRemote(false)}>拒绝</Button></div></article>}
          {remoteRequest?.status === 'approved' && <p className="rounded-xl bg-[#ecfdf3] px-4 py-3 text-center text-sm text-[#027a48]">你已授权远程协助；授权将在 30 分钟后自动失效。</p>}
          <div ref={bottomRef} />
        </div>

        <footer className="border-t border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5">
          {notice && <p role="status" className="mb-3 rounded-lg bg-[#fff4ed] px-3 py-2 text-xs text-[#b93815]">{notice}</p>}
          {confirmingClose ? <div role="group" aria-label="关闭前保留消息"><p className="text-sm">还有未发送的消息。你可以继续编辑，或丢弃后关闭。</p><div className="mt-3 flex flex-wrap gap-2"><Button ref={keepDraftRef} variant="outline" onClick={() => setConfirmingClose(false)}>保留并继续</Button><Button variant="destructive" onClick={onClose}>丢弃并关闭</Button></div></div> : conversation?.status === 'closed' ? (
            <p className="rounded-xl bg-[var(--background)] px-4 py-3 text-center text-sm text-[var(--muted-foreground)]">该工单已结束，对话记录仍可查看。</p>
          ) : (
            <div className="flex items-end gap-3">
              <Textarea ref={inputRef} aria-label="客服消息" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} rows={2} placeholder="输入消息，Enter 发送，Shift + Enter 换行" className="min-h-12 min-w-0 flex-1 resize-none" />
              <Button busy={pending} disabled={!draft.trim() || !conversation} onClick={send} className="h-12 w-12 shrink-0 rounded-full" aria-label="发送消息">
                <span className="material-icons-round">send</span>
              </Button>
            </div>
          )}
        </footer>
      </DialogContent>
      </Dialog>
    </>
  );
}

function NavigationCard({ body }: { body: string }) {
  const [path = '/dashboard', label = '工作台'] = body.slice('[导航协助]'.length).split('|');
  const allowed = ['/dashboard', '/settings', '/study-guide', '/timetable-hub'];
  if (!allowed.includes(path)) return <p>管理员发送了一条页面协助指令。</p>;
  return <div><p>管理员建议你打开“{label}”。</p><Link href={path} className="mt-3 inline-flex rounded-lg bg-[#155eef] px-3 py-2 text-sm font-semibold text-white">打开{label}</Link></div>;
}
