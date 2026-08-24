'use client';

import { useMemo, useState, useTransition } from 'react';
import { updateNetworkDevice, type NetworkDevice, type NetworkDeviceUpdate } from '@/actions/admin';

const TIER_LABELS: Record<NetworkDevice['access_tier'], string> = {
  trusted: '信任', known: '认识', guest: '访客', unknown: '未知',
};
const POLICY_LABELS: Record<NetworkDevice['access_policy'], string> = {
  review: '待判断', unrestricted: '不限速', limited: '限速', blocked: '阻断',
};
const STATUS_LABELS: Record<NetworkDevice['sync_status'], string> = {
  pending_review: '待审核', pending_apply: '待应用到路由器', applied: '已应用', error: '应用失败',
};

function DeviceEditor({ device, onSaved }: { device: NetworkDevice; onSaved: (device: NetworkDevice) => void }) {
  const [draft, setDraft] = useState<NetworkDeviceUpdate>({
    id: device.id,
    admin_label: device.admin_label,
    access_tier: device.access_tier,
    access_policy: device.access_policy,
    desired_download_mbps: device.desired_download_mbps ?? 5,
    desired_upload_mbps: device.desired_upload_mbps ?? 2,
    router_note: device.router_note,
    admin_notes: device.admin_notes,
    sync_status: device.sync_status,
  });
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();

  const save = (status: NetworkDevice['sync_status']) => startTransition(async () => {
    setNotice('');
    const payload = { ...draft, sync_status: status };
    const result = await updateNetworkDevice(payload);
    if (!result.success) return setNotice(result.error ?? '保存失败。');
    setDraft(payload);
    onSaved({ ...device, ...payload });
    setNotice(status === 'applied' ? '已标记为完成。' : '已保存，等待手动或桥接程序应用到 TR3000。');
  });

  const setPreset = (policy: NetworkDevice['access_policy']) => {
    const tier = policy === 'unrestricted' ? 'trusted' : policy === 'limited' ? 'guest' : draft.access_tier;
    setDraft({
      ...draft,
      access_policy: policy,
      access_tier: tier,
      desired_download_mbps: policy === 'limited' ? 5 : null,
      desired_upload_mbps: policy === 'limited' ? 2 : null,
      router_note: draft.router_note || draft.admin_label || device.claimed_name,
    });
  };

  const actionText = draft.access_policy === 'limited'
    ? `在 QoS 中为 ${device.mac_address ?? '待识别 MAC'} 设置下行 ${draft.desired_download_mbps} Mbps、上行 ${draft.desired_upload_mbps} Mbps，备注“${draft.router_note || draft.admin_label || device.claimed_name}”。`
    : draft.access_policy === 'unrestricted'
      ? `从 QoS 限速列表删除 ${device.mac_address ?? '待识别 MAC'} 的规则。`
      : draft.access_policy === 'blocked'
        ? `在 MAC 地址过滤中阻断 ${device.mac_address ?? '待识别 MAC'}。`
        : '先确认身份与 MAC 地址，不生成路由器动作。';

  return (
    <article className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{device.admin_label || device.claimed_name}</h2>
            <span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-xs text-[#475467] dark:bg-white/10 dark:text-[#cbd5e1]">{STATUS_LABELS[device.sync_status]}</span>
            {!device.identifiers_supplied && <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">缺少完整 IP/MAC</span>}
          </div>
          <p className="mt-1 text-sm text-[#667085] dark:text-[#98a2b3]">自报：{device.claimed_name}{device.relationship ? ` · ${device.relationship}` : ''}{device.device_label ? ` · ${device.device_label}` : ''}</p>
          <p className="mt-1 font-mono text-xs text-[#667085] dark:text-[#98a2b3]">{device.mac_address ?? 'MAC 未提供'} · {device.private_ip ?? 'IP 未提供'} · 登记 {device.registration_count} 次</p>
        </div>
        <p className="text-xs text-[#667085] dark:text-[#98a2b3]">最近：{new Date(device.last_registered_at).toLocaleString('zh-CN')}</p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-semibold text-[#475467] dark:text-[#cbd5e1]">管理员标记
          <input value={draft.admin_label ?? ''} maxLength={60} onChange={(event) => setDraft({ ...draft, admin_label: event.target.value })} placeholder="例如：Alex / 好友" className="mt-1.5 h-10 w-full rounded-lg border border-[#d0d5dd] bg-transparent px-3 text-sm font-normal outline-none focus:border-[#155eef]" />
        </label>
        <label className="text-xs font-semibold text-[#475467] dark:text-[#cbd5e1]">用户分级
          <select value={draft.access_tier} onChange={(event) => setDraft({ ...draft, access_tier: event.target.value as NetworkDevice['access_tier'] })} className="mt-1.5 h-10 w-full rounded-lg border border-[#d0d5dd] bg-transparent px-3 text-sm font-normal">
            {Object.entries(TIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-[#475467] dark:text-[#cbd5e1]">策略
          <select value={draft.access_policy} onChange={(event) => setPreset(event.target.value as NetworkDevice['access_policy'])} className="mt-1.5 h-10 w-full rounded-lg border border-[#d0d5dd] bg-transparent px-3 text-sm font-normal">
            {Object.entries(POLICY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-[#475467] dark:text-[#cbd5e1]">TR3000 备注
          <input value={draft.router_note ?? ''} maxLength={80} onChange={(event) => setDraft({ ...draft, router_note: event.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-[#d0d5dd] bg-transparent px-3 text-sm font-normal outline-none focus:border-[#155eef]" />
        </label>
      </div>

      {draft.access_policy === 'limited' && <div className="mt-4 grid gap-3 rounded-xl bg-[#f9fafb] p-4 sm:grid-cols-2 dark:bg-white/5">
        <label className="text-xs font-semibold">下行 Mbps<input type="number" min="0.01" max="10000" step="0.01" value={draft.desired_download_mbps ?? ''} onChange={(event) => setDraft({ ...draft, desired_download_mbps: Number(event.target.value) })} className="mt-1.5 h-10 w-full rounded-lg border border-[#d0d5dd] bg-transparent px-3 text-sm font-normal" /></label>
        <label className="text-xs font-semibold">上行 Mbps<input type="number" min="0.01" max="10000" step="0.01" value={draft.desired_upload_mbps ?? ''} onChange={(event) => setDraft({ ...draft, desired_upload_mbps: Number(event.target.value) })} className="mt-1.5 h-10 w-full rounded-lg border border-[#d0d5dd] bg-transparent px-3 text-sm font-normal" /></label>
      </div>}

      <label className="mt-4 block text-xs font-semibold text-[#475467] dark:text-[#cbd5e1]">内部备注
        <textarea rows={2} maxLength={1000} value={draft.admin_notes ?? ''} onChange={(event) => setDraft({ ...draft, admin_notes: event.target.value })} placeholder="记录如何认识、设备变更或限速原因…" className="mt-1.5 w-full rounded-lg border border-[#d0d5dd] bg-transparent p-3 text-sm font-normal leading-6 outline-none focus:border-[#155eef]" />
      </label>

      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900"><span className="font-semibold">待执行：</span>{actionText}</div>
      {notice && <p role="status" className="mt-3 text-sm text-[#175cd3]">{notice}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={pending} onClick={() => setPreset('unrestricted')} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-50">解除限速</button>
        <button type="button" disabled={pending} onClick={() => setPreset('limited')} className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50">设为 5/2 Mbps</button>
        <button type="button" disabled={pending} onClick={() => save(device.mac_address ? 'pending_apply' : 'pending_review')} className="rounded-lg bg-[#155eef] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{pending ? '保存中…' : device.mac_address ? '保存为待应用' : '保存审核信息'}</button>
        <button type="button" disabled={pending || device.sync_status !== 'pending_apply'} onClick={() => save('applied')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">标记已应用</button>
      </div>
    </article>
  );
}

export default function NetworkDeviceManager({ devices }: { devices: NetworkDevice[] }) {
  const [items, setItems] = useState(devices);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | NetworkDevice['sync_status']>('all');
  const visible = useMemo(() => items.filter((device) => {
    const haystack = `${device.claimed_name} ${device.admin_label ?? ''} ${device.mac_address ?? ''} ${device.private_ip ?? ''} ${device.device_label ?? ''}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (filter === 'all' || device.sync_status === filter);
  }), [items, query, filter]);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-[#e4e7ec] bg-white p-4 dark:border-white/10 dark:bg-[#182230]">
        <div className="flex flex-col gap-3 lg:flex-row">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、MAC、IP 或设备备注" className="h-11 flex-1 rounded-xl border border-[#d0d5dd] bg-transparent px-4 text-sm outline-none focus:border-[#155eef]" />
          <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="h-11 rounded-xl border border-[#d0d5dd] bg-transparent px-3 text-sm">
            <option value="all">全部状态</option><option value="pending_review">待审核</option><option value="pending_apply">待应用</option><option value="applied">已应用</option><option value="error">应用失败</option>
          </select>
        </div>
        <p className="mt-3 text-xs leading-5 text-[#667085] dark:text-[#98a2b3]">此页面只生成和记录路由器动作；当前不会远程修改 TR3000。完成手动配置后再点击“标记已应用”。</p>
      </div>
      {visible.map((device) => <DeviceEditor key={device.id} device={device} onSaved={(updated) => setItems((all) => all.map((item) => item.id === updated.id ? updated : item))} />)}
      {!visible.length && <div className="rounded-2xl border border-dashed border-[#d0d5dd] p-10 text-center text-sm text-[#667085]">暂无匹配的网络设备登记。</div>}
    </section>
  );
}
