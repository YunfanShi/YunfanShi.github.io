'use client';

import { useState, useTransition } from 'react';
import { submitBugReport } from '@/actions/feedback';
import logger from '@/lib/logger';
import { APP_VERSION } from '@/lib/utils';

export default function BetaFeedbackForm() {
  const [kind, setKind] = useState<'bug' | 'suggestion'>('bug');
  const [feature, setFeature] = useState('Companion 自动打开与填写');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => startTransition(async () => {
    setMessage('');
    const result = await submitBugReport({
      title: `[BETA v${APP_VERSION}] ${feature}`,
      description: `测试功能：${feature}\n\n${description.trim()}`,
      severity: kind === 'bug' ? 'normal' : 'low',
      ticketType: kind,
      pageUrl: window.location.href,
      diagnostics: kind === 'bug' ? logger.getDiagnosticSnapshot() : undefined,
    });
    if (!result.success) return setMessage(result.error ?? '提交失败，请稍后重试。');
    setDescription('');
    setMessage('反馈已提交。你可以在“设置 → 高级”中查看处理进度和继续对话。');
  });

  return <section id="feedback" className="rounded-3xl border border-[#d6bbfb] bg-[var(--card)] p-5 sm:p-7">
    <div className="flex items-start gap-3"><span className="material-icons-round grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#7f56d9] text-white">rate_review</span><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#7f56d9]">BETA Feedback</p><h2 className="mt-1 text-xl font-bold">提交测试反馈</h2><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">Bug 会自动附加脱敏诊断信息；不会附加 Prompt、AI 回复、密码或 API Key。</p></div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">反馈类型<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3"><option value="bug">Bug / 运行异常</option><option value="suggestion">建议 / 体验改进</option></select></label><label className="text-sm font-semibold">测试功能<select value={feature} onChange={(event) => setFeature(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3"><option>Companion 自动打开与填写</option><option>本地网页 AI</option><option>AI 网站工作室</option><option>BETA 测试中心</option></select></label></div>
    <label className="mt-4 block text-sm font-semibold">复现过程或建议<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} placeholder="请写明：你做了什么、预期发生什么、实际发生什么。" className="mt-1.5 w-full resize-y rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3 text-sm leading-6 outline-none focus:border-[#7f56d9] focus:ring-4 focus:ring-[#7f56d9]/10" /></label>
    <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={pending || description.trim().length < 8} onClick={submit} className="min-h-11 rounded-xl bg-[#7f56d9] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{pending ? '提交中…' : '提交 BETA 反馈'}</button>{message && <p role="status" className="text-sm text-[var(--muted-foreground)]">{message}</p>}</div>
  </section>;
}
