'use client';

import dynamic from 'next/dynamic';
import { useState, useTransition } from 'react';
import { submitAccountAppeal, type TicketType } from '@/actions/feedback';

const SupportConversationDialog = dynamic(() => import('@/components/modules/support-conversation-dialog'), {
  loading: () => null,
});

interface Props {
  ticketType: Exclude<TicketType, 'bug'>;
  existingTicketId: string | null;
  canAppeal: boolean;
}

export default function AccountAppealPanel({ ticketType, existingTicketId, canAppeal }: Props) {
  const [ticketId, setTicketId] = useState(existingTicketId);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const result = await submitAccountAppeal(ticketType, message);
      if (!result.success || !result.ticketId) {
        setNotice(result.error ?? '申请提交失败，请稍后重试。');
        return;
      }
      setTicketId(result.ticketId);
      setNotice(existingTicketId ? '已打开现有申诉工单。' : '申诉工单已创建，可以开始与管理员沟通。');
      setMessage('');
      setChatOpen(true);
    });
  };

  return (
    <section className="mt-6 rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eff4ff] text-[#155eef]">
          <span className="material-icons-round">forum</span>
        </span>
        <div>
          <h2 className="font-semibold text-[var(--foreground)]">联系管理员</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">提交后会生成工单。管理员回复时会出现在客服对话中，你可以继续补充说明。</p>
        </div>
      </div>

      {ticketId ? (
        <button type="button" onClick={() => setChatOpen(true)} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-[#155eef] px-4 text-sm font-semibold text-white hover:bg-[#004eeb]">
          <span className="material-icons-round text-lg">support_agent</span>
          打开申诉对话
        </button>
      ) : (
        <>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} disabled={!canAppeal || pending} rows={4} placeholder={ticketType === 'suspension_appeal' ? '请说明你认为需要复核的原因，或补充相关情况…' : '请确认希望恢复账号，并说明需要管理员了解的情况…'} className="mt-5 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 text-sm leading-6 outline-none focus:border-[#155eef] focus:ring-2 focus:ring-[#155eef]/15 disabled:opacity-50" />
          <button type="button" disabled={!canAppeal || pending || !message.trim()} onClick={submit} className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-[#155eef] px-4 text-sm font-semibold text-white hover:bg-[#004eeb] disabled:cursor-not-allowed disabled:opacity-45">
            <span className="material-icons-round text-lg">send</span>
            {pending ? '正在提交…' : ticketType === 'suspension_appeal' ? '提交暂停申诉' : '申请恢复账号'}
          </button>
        </>
      )}
      {!canAppeal && <p className="mt-3 text-sm text-[#b42318]">该账户已超过 30 天恢复期限，无法在线提交恢复申请。</p>}
      {notice && <p role="status" className="mt-3 text-sm text-[var(--muted-foreground)]">{notice}</p>}
      {chatOpen && ticketId && <SupportConversationDialog ticketId={ticketId} onClose={() => window.location.reload()} />}
    </section>
  );
}
