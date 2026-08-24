'use client';

import { useState, useTransition } from 'react';
import { NETWORK_RELATIONSHIPS } from '@/lib/network-access';

type Props = {
  clientMac?: string;
  clientIp?: string;
  routerNasId?: string;
};

export default function NetworkAccessForm({ clientMac, clientIp, routerNasId }: Props) {
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
          clientMac,
          clientIp,
          routerNasId,
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
      <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,.12)] sm:p-8">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-700" aria-hidden>✓</div>
        <h1 className="mt-5 text-center text-2xl font-semibold text-slate-950">设备已登记</h1>
        <p role="status" className="mx-auto mt-3 max-w-md text-center text-sm leading-6 text-slate-600">{notice}</p>
        <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">可以关闭此页面并继续使用网络。</p>
      </section>
    );
  }

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); submit(); }}
      className="rounded-3xl border border-white/70 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,.14)] sm:p-8"
    >
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#155eef] text-xl font-bold text-white">J</div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#155eef]">JackYun Network</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">连接前请登记身份</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">用于识别设备、避免误限速，并在网络繁忙或路由器过热时优先保障已确认的朋友和家人。</p>
        </div>
      </div>

      <div className="mt-7 space-y-5">
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">你的姓名或常用称呼 <span className="text-red-600">*</span></span>
          <input required maxLength={60} autoComplete="name" value={claimedName} onChange={(event) => setClaimedName(event.target.value)} placeholder="例如：小明 / Alex" className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none focus:border-[#155eef] focus:ring-4 focus:ring-blue-100" />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-800">你与网络管理员的关系</span>
          <select value={relationship} onChange={(event) => setRelationship(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none focus:border-[#155eef] focus:ring-4 focus:ring-blue-100">
            {NETWORK_RELATIONSHIPS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-800">设备备注 <span className="font-normal text-slate-500">（可选）</span></span>
          <input maxLength={60} value={deviceLabel} onChange={(event) => setDeviceLabel(event.target.value)} placeholder="例如：Alex 的 iPhone" className="mt-2 h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-base text-slate-950 outline-none focus:border-[#155eef] focus:ring-4 focus:ring-blue-100" />
        </label>
      </div>

      <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-slate-600">
        <p className="font-semibold text-slate-800">会记录什么？</p>
        <p className="mt-1">你的称呼、关系和设备备注；如果路由器提供，还会记录该设备在此局域网中的 IP 与 MAC 地址。信息仅用于设备识别、网络分级、限速/解除限速和故障排查，不收集密码、短信或浏览内容。</p>
      </div>

      <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-slate-700">
        <input type="checkbox" required checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#155eef]" />
        <span>我已了解上述用途，并同意提交这些基础网络识别信息。</span>
      </label>

      {notice && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{notice}</p>}
      <button type="submit" disabled={pending || !claimedName.trim() || !privacyAccepted} className="mt-6 w-full rounded-2xl bg-[#155eef] px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-[#004eeb] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none">{pending ? '正在登记…' : '登记并继续'}</button>

      <div aria-hidden className="hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <p className="mt-4 text-center text-xs text-slate-500">设备标识：{clientMac || clientIp ? '路由器已提供' : '等待路由器联动'}</p>
    </form>
  );
}
