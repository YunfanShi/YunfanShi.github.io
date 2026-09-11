'use client';

import { useEffect, useState, useTransition } from 'react';
import { getRedemptionHistory, redeemCode } from '@/actions/reader';
import { formatRedemptionCode } from '@/lib/redemption';

function playSuccessChime(context: AudioContext | null) {
  if (!context) return;
  const start = context.currentTime;
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + index * 0.11);
    gain.gain.exponentialRampToValueAtTime(0.16, start + index * 0.11 + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.11 + 0.5);
    oscillator.connect(gain).connect(context.destination); oscillator.start(start + index * 0.11); oscillator.stop(start + index * 0.11 + 0.52);
  });
  window.setTimeout(() => void context.close(), 1000);
}

function rewardDetails(reward: Record<string, unknown>) {
  if (reward.type === 'novel') return [{ label: '权益', value: '永久图书' }, { label: '书名', value: String(reward.title ?? '已领取小说') }, { label: '作者', value: String(reward.author || '未注明') }];
  return [{ label: '权益', value: `${String(reward.plan ?? '').toUpperCase()} 会员` }, { label: '有效期', value: `${Number(reward.days ?? 0)} 天` }, { label: '到期时间', value: reward.expiresAt ? new Date(String(reward.expiresAt)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '永久' }];
}

export default function RedemptionCenter({ signedIn }: { signedIn: boolean }) {
  const [code, setCode] = useState(''); const [pending, start] = useTransition(); const [error, setError] = useState('');
  const [reward, setReward] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; reward: Record<string, unknown>; redeemedAt: string }>>([]);
  useEffect(() => { if (signedIn) void getRedemptionHistory().then(setHistory); }, [signedIn]);
  function submit() {
    let audio: AudioContext | null = null;
    try { audio = new AudioContext(); void audio.resume(); } catch { audio = null; }
    start(async () => {
      setError(''); const result = await redeemCode(code);
      if (!result.success || !result.reward) { setError(result.error ?? '兑换失败'); void audio?.close(); return; }
      setReward(result.reward); setCode(''); playSuccessChime(audio);
      setHistory(await getRedemptionHistory());
    });
  }
  if (!signedIn) return <div className="rounded-2xl border border-[#fdb022]/40 bg-[#fffaeb] p-5 text-sm text-[#7a2e0e] dark:bg-[#3a2a0e] dark:text-[#fec84b]">请先登录账号，再使用兑换码。兑换后的图书和会员会自动绑定到账号。</div>;
  return <>
    <div className="overflow-hidden rounded-3xl border border-[#d6bbfb] bg-[radial-gradient(circle_at_top_right,#f4ebff,transparent_38%),linear-gradient(135deg,#fff,#f8f5ff)] p-5 shadow-sm dark:border-[#6941c6]/50 dark:bg-[radial-gradient(circle_at_top_right,#42307d,transparent_38%),linear-gradient(135deg,#172033,#20153a)] sm:p-7"><div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#7f56d9] text-white shadow-lg shadow-[#7f56d9]/25"><span className="material-icons-round text-3xl">redeem</span></span><div><h3 className="text-xl font-bold">兑换你的专属权益</h3><p className="mt-1 text-sm text-[var(--muted-foreground)]">支持图书、Plus、Pro、Ultra 会员兑换码。</p></div></div><label className="mt-6 block text-sm font-semibold">兑换码<div className="mt-2 flex flex-col gap-3 sm:flex-row"><input value={code} onChange={(event) => setCode(formatRedemptionCode(event.target.value))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } }} autoComplete="off" spellCheck={false} maxLength={39} placeholder="XXXX-XXXX-XXXX" className="min-h-14 min-w-0 flex-1 rounded-2xl border border-[#d6bbfb] bg-white px-5 font-mono text-lg font-bold uppercase tracking-[.16em] text-[#53389e] outline-none focus:border-[#7f56d9] focus:ring-4 focus:ring-[#7f56d9]/15 dark:bg-[#101828] dark:text-[#d6bbfb]" /><button type="button" onClick={submit} disabled={pending || code.replace(/-/g, '').length < 6} className="min-h-14 rounded-2xl bg-[linear-gradient(100deg,#7f56d9,#9e77ed)] px-7 font-bold text-white shadow-lg shadow-[#7f56d9]/20 disabled:opacity-45">{pending ? '正在兑换…' : '立即兑换'}</button></div></label>{error && <p role="alert" className="mt-3 rounded-xl bg-[#fef3f2] px-4 py-3 text-sm font-medium text-[#b42318] dark:bg-[#55160c] dark:text-[#fecdca]">{error}</p>}</div>
    {history.length > 0 && <div className="mt-6"><h3 className="font-semibold">最近兑换</h3><div className="mt-3 space-y-2">{history.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-3"><span className="material-icons-round text-[#7f56d9]">verified</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.reward.type === 'novel' ? `《${String(item.reward.title ?? '小说')}》` : `${String(item.reward.plan ?? '').toUpperCase()} 会员`}</p><p className="text-xs text-[var(--muted-foreground)]">{new Date(item.redeemedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p></div></div>)}</div></div>}
    {reward && <div role="dialog" aria-modal="true" aria-labelledby="redeem-success-title" className="fixed inset-0 z-[100] grid place-items-center bg-[#101828]/65 p-4 backdrop-blur-md" onMouseDown={(event) => { if (event.currentTarget === event.target) setReward(null); }}><div className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-white/50 bg-white p-7 text-[#101828] shadow-[0_32px_100px_rgba(31,20,61,.4)]"><div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[#d6bbfb] blur-3xl" /><div className="relative"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[linear-gradient(135deg,#12b76a,#32d583)] text-white shadow-xl shadow-[#12b76a]/25"><span className="material-icons-round text-5xl">check</span></div><p className="mt-5 text-center text-sm font-bold uppercase tracking-[.18em] text-[#7f56d9]">Redemption complete</p><h2 id="redeem-success-title" className="mt-2 text-center text-3xl font-bold tracking-tight">兑换成功</h2><p className="mt-2 text-center text-sm text-[#667085]">权益已安全绑定到你的 JackYun 账号</p><dl className="mt-6 space-y-3 rounded-2xl bg-[#f9f5ff] p-4">{rewardDetails(reward).map((item) => <div key={item.label} className="flex items-start justify-between gap-4"><dt className="text-sm text-[#667085]">{item.label}</dt><dd className="text-right text-sm font-bold text-[#53389e]">{item.value}</dd></div>)}</dl><button type="button" autoFocus onClick={() => setReward(null)} className="mt-6 min-h-12 w-full rounded-2xl bg-[#7f56d9] font-bold text-white">太棒了</button></div></div></div>}
  </>;
}
