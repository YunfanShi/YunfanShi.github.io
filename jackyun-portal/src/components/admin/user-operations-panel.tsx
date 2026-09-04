'use client';

import { useMemo, useState, useTransition } from 'react';
import { inviteUserAccount, sendPasswordResetForUser, setAccountStatus, type ManagedUser } from '@/actions/admin';
import { setBetaInvitation } from '@/actions/beta';
import type { BetaEnrollment, BetaEnrollmentStatus } from '@/lib/beta';
import { setUserPlan, type PlanCode } from '@/actions/ai-admin';

const REASONS = ['违反平台使用规范', '异常或高风险行为', '多次滥用平台功能', '账户安全保护', '其他'] as const;

interface SuspensionDraft {
  user: ManagedUser;
  reason: string;
  customReason: string;
  explanation: string;
}

const BETA_STATUS_LABELS: Record<BetaEnrollmentStatus, string> = {
  invited: '等待同意', accepted: '已同意', declined: '已拒绝', revoked: '已撤销',
};

export default function UserOperationsPanel({ users, currentUserId, betaEnrollments, userPlans }: { users: ManagedUser[]; currentUserId: string; betaEnrollments: BetaEnrollment[]; userPlans: Record<string, PlanCode> }) {
  const [items, setItems] = useState(users);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'suspended' | 'deleted'>('all');
  const [draft, setDraft] = useState<SuspensionDraft | null>(null);
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();
  const [betaByUser, setBetaByUser] = useState(() => new Map(betaEnrollments.map((entry) => [entry.user_id, entry])));
  const [plansByUser, setPlansByUser] = useState(userPlans);
  const [inviteEmail, setInviteEmail] = useState('');

  const visible = useMemo(() => items.filter((user) => {
    const search = `${user.display_name ?? ''} ${user.email ?? ''} ${user.id}`.toLowerCase().includes(query.toLowerCase());
    const state = filter === 'all' || (filter === 'deleted' ? Boolean(user.deleted_at) : user.account_status === filter);
    return search && state;
  }), [items, query, filter]);

  const restore = (user: ManagedUser) => startTransition(async () => {
    setNotice('');
    const result = await setAccountStatus(user.id, 'active');
    if (!result.success) return setNotice(result.error ?? '恢复账户失败。');
    setItems((all) => all.map((entry) => entry.id === user.id ? { ...entry, account_status: 'active', suspended_reason: null, suspended_explanation: null } : entry));
    setNotice('账户暂停已取消。');
  });

  const suspend = () => {
    if (!draft) return;
    const reason = draft.reason === '其他' ? draft.customReason.trim() : draft.reason;
    if (!reason) return;
    startTransition(async () => {
      setNotice('');
      const result = await setAccountStatus(draft.user.id, 'suspended', reason, draft.explanation.trim());
      if (!result.success) return setNotice(result.error ?? '暂停账户失败。');
      setItems((all) => all.map((entry) => entry.id === draft.user.id ? { ...entry, account_status: 'suspended', suspended_reason: reason, suspended_explanation: draft.explanation.trim() || null } : entry));
      setNotice('账户已暂停。用户下次访问时会看到原因、说明和申诉入口。');
      setDraft(null);
    });
  };

  const sendPasswordReset = () => {
    if (!resetTarget) return;
    startTransition(async () => {
      setNotice('');
      const result = await sendPasswordResetForUser(resetTarget.id);
      if (!result.success) return setNotice(result.error ?? '密码重置邮件发送失败。');
      setNotice(`已向 ${resetTarget.email} 发送密码重置邮件。`);
      setResetTarget(null);
    });
  };

  const updateBeta = (user: ManagedUser, invited: boolean) => startTransition(async () => {
    setNotice('');
    const result = await setBetaInvitation(user.id, invited);
    if (!result.success) return setNotice(result.error ?? '更新 BETA 状态失败。');
    setBetaByUser((current) => {
      const next = new Map(current);
      next.set(user.id, {
        user_id: user.id,
        status: invited ? 'invited' : 'revoked',
        invited_at: new Date().toISOString(),
        responded_at: null,
        agreement_version: null,
      });
      return next;
    });
    setNotice(invited ? 'BETA 邀请已发出，用户下次进入网站时可以同意或拒绝。' : 'BETA 资格已撤销，用户将返回 Stable。');
  });

  const updatePlan = (userId: string, plan: PlanCode) => startTransition(async () => {
    const result = await setUserPlan(userId, plan);
    if (!result.success) return setNotice(result.error ?? '更新套餐失败。');
    setPlansByUser((current) => ({ ...current, [userId]: plan }));
    setNotice(`用户套餐已更新为 ${plan.toUpperCase()}。`);
  });

  const inviteAccount = () => startTransition(async () => {
    setNotice('');
    const result = await inviteUserAccount(inviteEmail);
    if (!result.success) return setNotice(result.error ?? '邀请账户失败。');
    setNotice(`已向 ${inviteEmail.trim()} 发送账户邀请。`);
    setInviteEmail('');
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 rounded-xl border border-[#dbe7ff] bg-[#f8faff] p-3 dark:border-[#155eef]/30 dark:bg-[#155eef]/10 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold">邀请新账户</p><p className="text-xs text-[#667085] dark:text-[#98a2b3]">发送安全注册链接；管理员不会设置或看到用户密码。</p></div>
        <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" className="h-10 min-w-0 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm outline-none focus:border-[#155eef] dark:border-white/15 dark:bg-white/5 sm:w-64" />
        <button type="button" disabled={pending || !inviteEmail.trim()} onClick={inviteAccount} className="h-10 rounded-lg bg-[#155eef] px-4 text-sm font-semibold text-white disabled:opacity-50">发送邀请</button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、邮箱或用户 ID" className="h-10 flex-1 rounded-lg border border-[#d0d5dd] bg-white px-3 text-sm outline-none focus:border-[#155eef] dark:border-white/15 dark:bg-white/5" />
        <div className="flex gap-1 rounded-lg bg-[#f2f4f7] p-1 dark:bg-white/5">
          {([['all', '全部'], ['active', '正常'], ['suspended', '已暂停'], ['deleted', '待恢复']] as const).map(([value, label]) => (
            <button type="button" key={value} onClick={() => setFilter(value)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${filter === value ? 'bg-white text-[#155eef] shadow-sm dark:bg-[#344054]' : 'text-[#667085] dark:text-[#98a2b3]'}`}>{label}</button>
          ))}
        </div>
      </div>
      {notice && <p role="status" className="rounded-lg bg-[#eff8ff] px-3 py-2 text-xs text-[#175cd3]">{notice}</p>}
      <div className="overflow-x-auto rounded-xl border border-[#eaecf0] dark:border-white/10">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-[#f9fafb] text-xs text-[#667085] dark:bg-white/5 dark:text-[#98a2b3]"><tr><th className="px-4 py-3">用户</th><th className="px-4 py-3">账户</th><th className="px-4 py-3">套餐</th><th className="px-4 py-3">发布通道</th><th className="px-4 py-3">BETA 同意状态</th><th className="px-4 py-3">云端数据</th><th className="px-4 py-3">注册时间</th><th className="px-4 py-3" /></tr></thead>
          <tbody>{visible.map((user) => (
            <tr key={user.id} className="border-t border-[#eaecf0] dark:border-white/10">
              <td className="px-4 py-3"><p className="font-medium">{user.display_name || '未命名用户'}</p><p className="mt-0.5 text-xs text-[#667085] dark:text-[#98a2b3]">{user.email || user.id}</p></td>
              <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${user.deleted_at ? 'bg-[#fef3f2] text-[#b42318]' : user.account_status === 'suspended' ? 'bg-[#fffaeb] text-[#b54708]' : 'bg-[#ecfdf3] text-[#027a48]'}`}>{user.deleted_at ? '待恢复' : user.account_status === 'suspended' ? '已暂停' : '正常'}</span><p className="mt-1 text-[10px] uppercase text-[#667085]">{user.role}</p>{user.suspended_reason && <p className="mt-1 max-w-40 truncate text-xs text-[#667085]" title={`${user.suspended_reason}${user.suspended_explanation ? `：${user.suspended_explanation}` : ''}`}>{user.suspended_reason}</p>}</td>
              <td className="px-4 py-3"><select aria-label={`${user.display_name || user.email || '用户'}套餐`} disabled={pending} value={plansByUser[user.id] ?? 'free'} onChange={(event) => updatePlan(user.id, event.target.value as PlanCode)} className="rounded-lg border border-[#d0d5dd] bg-transparent px-2 py-1 text-xs uppercase"><option value="free">Free</option><option value="plus">Plus</option><option value="pro">Pro</option><option value="ultra">Ultra</option></select></td>
              <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${betaByUser.get(user.id)?.status === 'accepted' ? 'bg-[#f4ebff] text-[#6941c6]' : 'bg-[#f2f4f7] text-[#475467]'}`}>{betaByUser.get(user.id)?.status === 'accepted' ? 'BETA' : 'STABLE'}</span></td>
              <td className="px-4 py-3 text-xs"><p>{betaByUser.get(user.id) ? BETA_STATUS_LABELS[betaByUser.get(user.id)!.status] : '未邀请'}</p>{betaByUser.get(user.id)?.agreement_version && <p className="mt-1 text-[10px] text-[#667085]">协议 {betaByUser.get(user.id)!.agreement_version}</p>}</td>
              <td className="px-4 py-3 text-xs text-[#667085] dark:text-[#98a2b3]">{user.focus_sessions} 次专注<br />{user.legacy_records} 条旧模块记录</td>
              <td className="px-4 py-3 text-xs text-[#667085] dark:text-[#98a2b3]">{new Date(user.created_at).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                {!user.deleted_at && (betaByUser.get(user.id)?.status === 'accepted' || betaByUser.get(user.id)?.status === 'invited' ? <button type="button" disabled={pending} onClick={() => updateBeta(user, false)} className="mr-2 rounded-lg border border-[#d0d5dd] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">撤销 BETA</button> : <button type="button" disabled={pending} onClick={() => updateBeta(user, true)} className="mr-2 rounded-lg bg-[#f4ebff] px-3 py-1.5 text-xs font-semibold text-[#6941c6] disabled:opacity-50">邀请 BETA</button>)}
                {user.email && <button type="button" disabled={pending} onClick={() => setResetTarget(user)} className="mr-2 rounded-lg border border-[#b2ddff] px-3 py-1.5 text-xs font-semibold text-[#175cd3] disabled:opacity-50">发送重置邮件</button>}
                {!user.deleted_at && (user.account_status === 'active' ? (
                  <button type="button" disabled={pending || user.id === currentUserId} title={user.id === currentUserId ? '不能暂停当前登录账户' : undefined} onClick={() => setDraft({ user, reason: REASONS[0], customReason: '', explanation: '' })} className="rounded-lg bg-[#fef3f2] px-3 py-1.5 text-xs font-semibold text-[#b42318] disabled:cursor-not-allowed disabled:opacity-50">暂停账户</button>
                ) : (
                  <button type="button" disabled={pending || user.id === currentUserId} title={user.id === currentUserId ? '不能修改当前登录账户状态' : undefined} onClick={() => restore(user)} className="rounded-lg bg-[#ecfdf3] px-3 py-1.5 text-xs font-semibold text-[#027a48] disabled:cursor-not-allowed disabled:opacity-50">取消暂停</button>
                ))}
              </td>
            </tr>
          ))}</tbody>
        </table>
        {!visible.length && <p className="p-8 text-center text-sm text-[#667085]">未找到用户</p>}
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/60 p-4 backdrop-blur-sm" onClick={() => !pending && setDraft(null)}>
          <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#182230]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.1em] text-[#b42318]">暂停账户</p><h2 className="mt-2 text-xl font-semibold">{draft.user.display_name || draft.user.email || '该用户'}</h2><p className="mt-1 text-sm text-[#667085] dark:text-[#98a2b3]">以下内容会展示给用户，并用于后续申诉审核。</p></div><button type="button" aria-label="关闭" onClick={() => setDraft(null)} className="rounded-lg p-1 text-[#667085]"><span className="material-icons-round">close</span></button></div>
            <label className="mt-5 block text-sm font-semibold">通用原因</label>
            <select value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-[#d0d5dd] bg-transparent px-3 text-sm">{REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select>
            {draft.reason === '其他' && <input value={draft.customReason} onChange={(event) => setDraft({ ...draft, customReason: event.target.value })} placeholder="输入暂停原因" className="mt-3 h-11 w-full rounded-xl border border-[#d0d5dd] bg-transparent px-3 text-sm" />}
            <label className="mt-4 block text-sm font-semibold">补充解释</label>
            <textarea value={draft.explanation} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} rows={5} placeholder="说明触发暂停的情况、用户可以如何处理，以及审核所需信息…" className="mt-2 w-full rounded-xl border border-[#d0d5dd] bg-transparent p-3 text-sm leading-6" />
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={pending} onClick={() => setDraft(null)} className="rounded-xl border border-[#d0d5dd] px-4 py-2.5 text-sm font-semibold">取消</button><button type="button" disabled={pending || (draft.reason === '其他' && !draft.customReason.trim())} onClick={suspend} className="rounded-xl bg-[#d92d20] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? '处理中…' : '确认暂停'}</button></div>
          </section>
        </div>
      )}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/60 p-4 backdrop-blur-sm" onClick={() => !pending && setResetTarget(null)}>
          <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#182230]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3"><span className="material-icons-round mt-0.5 text-[#175cd3]">lock_reset</span><div><h2 className="font-semibold">发送密码重置邮件</h2><p className="mt-2 text-sm leading-6 text-[#667085] dark:text-[#98a2b3]">将向 {resetTarget.email} 发送一次性重置链接。管理员不会看到或设置用户的新密码。</p></div></div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={pending} onClick={() => setResetTarget(null)} className="rounded-xl border border-[#d0d5dd] px-4 py-2.5 text-sm font-semibold">取消</button><button type="button" disabled={pending} onClick={sendPasswordReset} className="rounded-xl bg-[#155eef] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? '发送中…' : '确认发送'}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
