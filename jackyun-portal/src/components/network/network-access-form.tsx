'use client';

import { useState, useTransition } from 'react';
import { NETWORK_RELATIONSHIPS } from '@/lib/network-access';

type Props = {
  hasDeviceIdentity: boolean;
};

export default function NetworkAccessForm({ hasDeviceIdentity }: Props) {
  const [claimedName, setClaimedName] = useState('');
  const [relationship, setRelationship] = useState('朋友');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [notice, setNotice] = useState('');
  const [registrationId, setRegistrationId] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => startTransition(async () => {
    setNotice('');
    try {
      const response = await fetch('/api/network-access/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          claimedName,
          relationship,
          deviceLabel,
          privacyAccepted,
          website: '',
        }),
      });
      const result = await response.json().catch(() => ({ error: '登记服务暂时不可用。' }));
      if (!response.ok) {
        setNotice(result.error ?? '登记失败，请稍后重试。');
        return;
      }
      setRegistrationId(result.registrationId ?? 'registered');
      setNotice('登记成功。网络管理员会根据身份标记设备并确认是否需要限速。');
    } catch {
      setNotice('无法连接登记服务，请检查网络后重试。');
    }
  });

  if (registrationId) {
    return (
      <section className="w-full max-w-lg rounded-2xl border border-emerald-300/40 bg-slate-950/70 p-6 text-white shadow-2xl backdrop-blur-xl sm:p-9">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-400/20 text-2xl text-emerald-200" aria-hidden>✓</div>
        <h1 className="mt-5 text-center text-2xl font-semibold">设备已登记</h1>
        <p role="status" className="mx-auto mt-3 max-w-md text-center text-sm leading-6 text-slate-200">{notice}</p>
        <p className="mt-6 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-center text-sm text-slate-100">可以关闭此页面并继续使用网络。</p>
      </section>
    );
  }

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); submit(); }}
      className="w-full max-w-xl rounded-2xl border border-white/25 bg-slate-950/65 p-5 text-white shadow-2xl backdrop-blur-xl sm:p-8"
    >
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-sky-300">NETWORK REGISTRATION</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">网络接入登记</h1>
        <p className="mt-2 text-sm leading-6 text-slate-200">登记设备身份，避免误限速并帮助管理员维护网络稳定。</p>
      </div>

      <div className="mt-7 space-y-4">
        <label className="grid gap-2 sm:grid-cols-[8rem_1fr] sm:items-center">
          <span className="text-sm font-semibold">称呼 <span className="font-normal text-sky-200">Name</span> <span className="text-rose-300">*</span></span>
          <input required maxLength={60} autoComplete="name" value={claimedName} onChange={(event) => setClaimedName(event.target.value)} placeholder="姓名或常用称呼" className="h-11 w-full rounded-lg border border-white/30 bg-white/95 px-3 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-300/20" />
        </label>

        <label className="grid gap-2 sm:grid-cols-[8rem_1fr] sm:items-center">
          <span className="text-sm font-semibold">关系 <span className="font-normal text-sky-200">Relation</span></span>
          <select value={relationship} onChange={(event) => setRelationship(event.target.value)} className="h-11 w-full rounded-lg border border-white/30 bg-white/95 px-3 text-base text-slate-950 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-300/20">
            {NETWORK_RELATIONSHIPS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        <label className="grid gap-2 sm:grid-cols-[8rem_1fr] sm:items-center">
          <span className="text-sm font-semibold">设备 <span className="font-normal text-sky-200">Device</span></span>
          <input maxLength={60} value={deviceLabel} onChange={(event) => setDeviceLabel(event.target.value)} placeholder="例如：我的手机（可选）" className="h-11 w-full rounded-lg border border-white/30 bg-white/95 px-3 text-base text-slate-950 outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-300/20" />
        </label>
      </div>

      <div className="mt-6 rounded-xl border border-sky-300/25 bg-sky-400/10 p-4 text-xs leading-5 text-slate-200">
        <p className="font-semibold text-white">信息用途</p>
        <p className="mt-1">你的称呼、关系和设备备注；如果路由器提供，还会记录该设备在此局域网中的 IP 与 MAC 地址。信息仅用于设备识别、网络分级、限速/解除限速和故障排查，不收集密码、短信或浏览内容。</p>
      </div>

      <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-slate-100">
        <input type="checkbox" required checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-sky-400" />
        <span>我已了解上述用途，并同意提交这些基础网络识别信息。</span>
      </label>

      {notice && <p role="alert" className="mt-4 rounded-xl bg-rose-400/15 px-3 py-2 text-sm text-rose-100">{notice}</p>}
      <button type="submit" disabled={pending || !claimedName.trim() || !privacyAccepted} className="mt-6 w-full rounded-lg border border-sky-300/50 bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-300/30 disabled:cursor-not-allowed disabled:opacity-50">{pending ? '正在登记…' : '登记并连接  Register'}</button>

      <div aria-hidden className="hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <p className="mt-4 text-center text-xs text-slate-300">设备标识：{hasDeviceIdentity ? '已由路由器安全提供' : '不可用'}</p>
    </form>
  );
}
