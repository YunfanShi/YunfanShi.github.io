'use client';

import { useEffect, useState, useTransition } from 'react';
import { respondToBetaInvitation } from '@/actions/beta';
import type { BetaEnrollmentStatus } from '@/lib/beta';

export default function BetaExperience({ status }: { status: BetaEnrollmentStatus | null }) {
  const [visible, setVisible] = useState(status === 'invited');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    localStorage.setItem('jackyun_beta_active', status === 'accepted' ? 'true' : 'false');
  }, [status]);

  const respond = (accept: boolean) => startTransition(async () => {
    setError('');
    const result = await respondToBetaInvitation(accept);
    if (!result.success) return setError(result.error ?? '保存选择失败。');
    localStorage.setItem('jackyun_beta_active', accept ? 'true' : 'false');
    setVisible(false);
    window.location.reload();
  });

  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#101828]/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="beta-invite-title">
      <section className="w-full max-w-xl rounded-2xl bg-[var(--card)] p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#7f56d9]">BETA 测试邀请</p>
        <h2 id="beta-invite-title" className="mt-2 text-2xl font-semibold">是否加入 JackYun BETA？</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">你已被管理员选中体验测试功能。加入完全自愿，你可以选择同意或拒绝；拒绝后继续使用稳定版。</p>
        <div className="mt-4 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4 text-sm leading-6">
          <p className="font-semibold">测试用户协议（2026-09-03）</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted-foreground)]">
            <li>BETA 功能仍在测试，可能出现错误、变更或临时关闭。</li>
            <li>测试功能不会获得任意代码执行、账户管理或绕过安全限制的权限。</li>
            <li>系统会记录功能状态、错误信息和你的同意决定，不会因此发送邮件。</li>
            <li>本地功能数据保存在当前浏览器；清理浏览器数据可能删除未同步内容。</li>
            <li>管理员可以撤销测试资格；撤销后账户自动返回稳定版。</li>
          </ul>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-[#d92d20]">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={pending} onClick={() => respond(false)} className="rounded-xl border border-[var(--card-border)] px-4 py-2.5 text-sm font-semibold disabled:opacity-50">拒绝，使用 Stable</button>
          <button type="button" disabled={pending} onClick={() => respond(true)} className="rounded-xl bg-[#7f56d9] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? '保存中…' : '同意并加入 BETA'}</button>
        </div>
      </section>
    </div>
  );
}

