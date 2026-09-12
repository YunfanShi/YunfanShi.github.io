'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { createRedemptionCodes, deleteCatalogNovel, setRedemptionCodeEnabled, updateCatalogNovel, updateFeatureAccess, type AdminCode, type AdminFeature, type AdminNovel } from '@/actions/reader-admin';
import { PLAN_ORDER, type PlanCode } from '@/lib/redemption';

const planLabel: Record<PlanCode, string> = { free: 'Free', plus: 'Plus', pro: 'Pro', ultra: 'Ultra' };
const field = 'min-h-11 w-full rounded-xl border border-[#d0d5dd] bg-white px-3 text-sm outline-none focus:border-[#155eef] focus:ring-4 focus:ring-[#155eef]/10 dark:border-white/15 dark:bg-[#172033]';

function FeatureCard({ feature }: { feature: AdminFeature }) {
  const [value, setValue] = useState(feature); const [pending, start] = useTransition(); const [message, setMessage] = useState('');
  function save() { start(async () => { const result = await updateFeatureAccess({ key: value.key, enabled: value.enabled, betaOnly: value.betaOnly, minimumPlan: value.minimumPlan }); setMessage(result.success ? '已保存' : result.error ?? '保存失败'); }); }
  return <article className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#172033]"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{value.displayName}</h3><p className="mt-1 text-sm text-[#667085] dark:text-[#98a2b3]">{value.description}</p></div><label className="flex shrink-0 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={value.enabled} onChange={(event) => setValue({ ...value, enabled: event.target.checked })} />开启</label></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">最低会员<select className={`${field} mt-1.5`} value={value.minimumPlan} onChange={(event) => setValue({ ...value, minimumPlan: event.target.value as PlanCode })}>{PLAN_ORDER.map((plan) => <option key={plan} value={plan}>{planLabel[plan]}</option>)}</select></label><label className="flex items-end gap-2 rounded-xl border border-[#e4e7ec] px-3 pb-3 text-sm font-medium dark:border-white/10"><input type="checkbox" checked={value.betaOnly} onChange={(event) => setValue({ ...value, betaOnly: event.target.checked })} />仅 BETA 用户</label></div><div className="mt-4 flex items-center gap-3"><button type="button" disabled={pending} onClick={save} className="rounded-xl bg-[#155eef] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">保存规则</button><span className="text-xs text-[#667085]">{message}</span></div></article>;
}

function NovelRow({ novel, onUpdated, onDeleted }: { novel: AdminNovel; onUpdated: (novel: AdminNovel) => void; onDeleted: (id: string) => void }) {
  const [value, setValue] = useState(novel);
  const [expanded, setExpanded] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  function save() {
    start(async () => {
      const result = await updateCatalogNovel({ id: value.id, title: value.title, author: value.author, description: value.description, language: value.language, enabled: value.enabled, featured: value.featured, minimumPlan: value.minimumPlan });
      if (result.success) { onUpdated(value); setMessage('已保存，商店内容已更新。'); } else setMessage(result.error ?? '保存失败');
    });
  }
  function remove() {
    if (!window.confirm(`确定永久删除《${value.title}》吗？\n\n将同时删除商店书目、上传文件、关联兑换码和用户的该书兑换权限，不可恢复。`)) return;
    start(async () => {
      const result = await deleteCatalogNovel(value.id);
      if (!result.success) { setMessage(result.error ?? '删除失败'); return; }
      onDeleted(value.id);
      if (result.warning) window.alert(result.warning);
    });
  }
  return <article className="rounded-2xl border border-[#e4e7ec] bg-white p-4 dark:border-white/10 dark:bg-[#172033]">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{value.title}</h3><p className="mt-1 truncate text-sm text-[#667085] dark:text-[#98a2b3]">{value.author || '未填写作者'} · {(value.fileSize / 1024 / 1024).toFixed(2)} MB · {value.originalFileName}</p></div><select aria-label={`${value.title} 最低会员`} disabled={pending} className="min-h-10 rounded-xl border border-[#d0d5dd] bg-white px-3 text-sm dark:border-white/15 dark:bg-[#111827]" value={value.minimumPlan} onChange={(event) => setValue({ ...value, minimumPlan: event.target.value as PlanCode })}>{PLAN_ORDER.map((plan) => <option key={plan} value={plan}>{planLabel[plan]}</option>)}</select><label className="text-sm"><input type="checkbox" disabled={pending} checked={value.featured} onChange={(event) => setValue({ ...value, featured: event.target.checked })} /> 精选</label><label className="text-sm"><input type="checkbox" disabled={pending} checked={value.enabled} onChange={(event) => setValue({ ...value, enabled: event.target.checked })} /> 上架</label><button type="button" disabled={pending} onClick={() => setExpanded((current) => !current)} className="min-h-10 rounded-xl border border-[#d0d5dd] px-3 text-sm font-semibold">{expanded ? '收起' : '编辑资料'}</button><button type="button" disabled={pending} onClick={save} className="min-h-10 rounded-xl border border-[#155eef] px-3 text-sm font-semibold text-[#155eef] disabled:opacity-50">{pending ? '处理中…' : '保存'}</button><button type="button" disabled={pending} onClick={remove} className="min-h-10 rounded-xl border border-[#fda29b] px-3 text-sm font-semibold text-[#b42318] disabled:opacity-50">删除</button></div>
    {expanded && <div className="mt-4 grid gap-3 border-t border-[#e4e7ec] pt-4 sm:grid-cols-2 dark:border-white/10"><label className="text-sm font-medium">书名<input value={value.title} maxLength={160} onChange={(event) => setValue({ ...value, title: event.target.value })} className={`${field} mt-1.5`} /></label><label className="text-sm font-medium">作者<input value={value.author} maxLength={120} onChange={(event) => setValue({ ...value, author: event.target.value })} className={`${field} mt-1.5`} /></label><label className="text-sm font-medium">语言<select value={value.language} onChange={(event) => setValue({ ...value, language: event.target.value as AdminNovel['language'] })} className={`${field} mt-1.5`}><option value="zh">中文</option><option value="en">英文</option></select></label><label className="text-sm font-medium sm:col-span-2">简介<textarea value={value.description} maxLength={1000} rows={4} onChange={(event) => setValue({ ...value, description: event.target.value })} className={`${field} mt-1.5 py-3`} /></label></div>}
    {message && <p className="mt-3 text-xs text-[#667085]">{message}</p>}
  </article>;
}

export default function ContentLibraryPanel({ initialFeatures, initialNovels, initialCodes }: { initialFeatures: AdminFeature[]; initialNovels: AdminNovel[]; initialCodes: AdminCode[] }) {
  const [tab, setTab] = useState<'novels' | 'codes' | 'features'>('novels');
  const [novels, setNovels] = useState(initialNovels); const [codes, setCodes] = useState(initialCodes);
  const [uploading, setUploading] = useState(false); const uploadLock = useRef(false);
  const [pending, start] = useTransition(); const [message, setMessage] = useState(''); const [createdCodes, setCreatedCodes] = useState<string[]>([]);
  const [rewardType, setRewardType] = useState<'novel' | 'membership'>('novel'); const [selectedNovel, setSelectedNovel] = useState(initialNovels[0]?.id ?? '');
  const [planCode, setPlanCode] = useState<PlanCode>('plus');
  const activeCodes = useMemo(() => codes.filter((code) => code.enabled).length, [codes]);

  async function uploadNovel(formData: FormData) {
    if (uploadLock.current) return;
    uploadLock.current = true; setUploading(true); setMessage('正在上传并上架，请勿重复提交…');
    try {
      const response = await fetch('/api/admin/novels', { method: 'POST', body: formData }); const result = await response.json() as { error?: string };
      if (!response.ok) { setMessage(result.error ?? '上传失败'); return; }
      setMessage('小说上传成功，正在刷新管理列表…'); location.reload();
    } catch { setMessage('上传失败，请检查网络后重试。'); }
    finally { uploadLock.current = false; setUploading(false); }
  }
  function createCodes(formData: FormData) {
    start(async () => {
      setMessage(''); setCreatedCodes([]);
      const result = await createRedemptionCodes({
        customCode: String(formData.get('customCode') ?? '') || undefined, quantity: Number(formData.get('quantity') ?? 1), label: String(formData.get('label') ?? ''), rewardType,
        novelId: rewardType === 'novel' ? selectedNovel : undefined, planCode: rewardType === 'membership' ? planCode : undefined,
        membershipDays: rewardType === 'membership' ? Number(formData.get('membershipDays') ?? 30) : undefined,
        notBefore: String(formData.get('notBefore') ?? '') || null, expiresAt: String(formData.get('expiresAt') ?? '') || null,
        validDays: String(formData.get('validDays') ?? '') ? Number(formData.get('validDays')) : undefined, usageLimit: Number(formData.get('usageLimit') ?? 1),
      });
      if (!result.success) { setMessage(result.error ?? '创建失败'); return; }
      setCreatedCodes(result.codes ?? []); setMessage(`已创建 ${result.codes?.length ?? 0} 个兑换码；请现在复制，之后只显示前缀。`); location.hash = 'created-codes';
    });
  }
  function toggleCode(code: AdminCode) { start(async () => { const result = await setRedemptionCodeEnabled(code.id, !code.enabled); if (result.success) setCodes((items) => items.map((item) => item.id === code.id ? { ...item, enabled: !item.enabled } : item)); else setMessage(result.error ?? '更新失败'); }); }

  return <div className="space-y-6"><header><p className="text-sm font-semibold text-[#155eef]">内容与权限</p><h1 className="mt-1 text-3xl font-bold tracking-tight">阅读器运营中心</h1><p className="mt-2 text-sm text-[#667085] dark:text-[#98a2b3]">上传小说、创建图书或会员兑换码，并按套餐与 BETA 状态控制功能可见性。</p></header>
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-[#155eef] p-5 text-white"><p className="text-sm text-white/75">小说</p><strong className="mt-2 block text-3xl">{novels.length}</strong></div><div className="rounded-2xl bg-[#7f56d9] p-5 text-white"><p className="text-sm text-white/75">有效兑换码</p><strong className="mt-2 block text-3xl">{activeCodes}</strong></div><div className="rounded-2xl bg-[#0e9384] p-5 text-white"><p className="text-sm text-white/75">可控功能</p><strong className="mt-2 block text-3xl">{initialFeatures.length}</strong></div></div>
    <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-[#e4e7ec] bg-white p-2 dark:border-white/10 dark:bg-[#172033]">{([['novels','小说商店'],['codes','兑换码'],['features','功能权限']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`min-h-11 shrink-0 rounded-xl px-5 text-sm font-semibold ${tab === id ? 'bg-[#155eef] text-white' : 'text-[#475467] hover:bg-[#f2f4f7] dark:text-[#cbd5e1] dark:hover:bg-white/10'}`}>{label}</button>)}</nav>
    {message && <p role="status" className="rounded-xl border border-[#b2ddff] bg-[#eff8ff] px-4 py-3 text-sm text-[#175cd3] dark:bg-[#102a43] dark:text-[#b2ddff]">{message}</p>}

    {tab === 'novels' && <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]"><form action={uploadNovel} className="self-start rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#172033]"><h2 className="text-lg font-semibold">上传小说</h2><div className="mt-4 space-y-4"><label className="block text-sm font-medium">书名<input name="title" required maxLength={160} className={`${field} mt-1.5`} /></label><label className="block text-sm font-medium">作者<input name="author" maxLength={120} className={`${field} mt-1.5`} /></label><label className="block text-sm font-medium">简介<textarea name="description" maxLength={1000} rows={4} className={`${field} mt-1.5 py-3`} /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">语言<select name="language" className={`${field} mt-1.5`}><option value="zh">中文</option><option value="en">英文</option></select></label><label className="text-sm font-medium">最低会员<select name="minimumPlan" className={`${field} mt-1.5`}>{PLAN_ORDER.map((plan) => <option key={plan} value={plan}>{planLabel[plan]}</option>)}</select></label></div><label className="block text-sm font-medium">小说文件<input name="file" required type="file" accept=".txt,.text,.md,.markdown,.html,.htm,.epub" className="mt-1.5 block w-full text-sm" /></label><label className="block text-sm font-medium">封面（可选）<input name="cover" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1.5 block w-full text-sm" /></label><button type="submit" disabled={uploading} className="min-h-11 w-full rounded-xl bg-[#155eef] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#98a2b3]">{uploading ? '正在上传…' : '上传并上架'}</button></div></form><section className="space-y-3"><h2 className="text-lg font-semibold">商店书目</h2>{novels.map((novel) => <NovelRow key={novel.id} novel={novel} onUpdated={(updated) => setNovels((items) => items.map((item) => item.id === updated.id ? updated : item))} onDeleted={(id) => setNovels((items) => items.filter((item) => item.id !== id))} />)}{!novels.length && <p className="rounded-2xl border border-dashed border-[#d0d5dd] p-10 text-center text-sm text-[#667085]">还没有上传小说。</p>}</section></div>}

    {tab === 'codes' && <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]"><form action={createCodes} className="self-start rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#172033]"><h2 className="text-lg font-semibold">创建兑换码</h2><div className="mt-4 space-y-4"><label className="block text-sm font-medium">名称<input name="label" maxLength={120} placeholder="例如：秋季阅读礼包" className={`${field} mt-1.5`} /></label><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setRewardType('novel')} className={`min-h-11 rounded-xl border font-semibold ${rewardType === 'novel' ? 'border-[#155eef] bg-[#eff4ff] text-[#155eef]' : 'border-[#d0d5dd]'}`}>图书</button><button type="button" onClick={() => setRewardType('membership')} className={`min-h-11 rounded-xl border font-semibold ${rewardType === 'membership' ? 'border-[#7f56d9] bg-[#f4f3ff] text-[#6941c6]' : 'border-[#d0d5dd]'}`}>会员</button></div>{rewardType === 'novel' ? <label className="block text-sm font-medium">兑换小说<select value={selectedNovel} onChange={(event) => setSelectedNovel(event.target.value)} className={`${field} mt-1.5`}>{novels.map((novel) => <option key={novel.id} value={novel.id}>{novel.title}</option>)}</select></label> : <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">会员等级<select value={planCode} onChange={(event) => setPlanCode(event.target.value as PlanCode)} className={`${field} mt-1.5`}>{PLAN_ORDER.slice(1).map((plan) => <option key={plan} value={plan}>{planLabel[plan]}</option>)}</select></label><label className="text-sm font-medium">有效天数<input name="membershipDays" type="number" min={1} max={3650} defaultValue={30} className={`${field} mt-1.5`} /></label></div>}<div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">生成数量<input name="quantity" type="number" min={1} max={200} defaultValue={1} className={`${field} mt-1.5`} /></label><label className="text-sm font-medium">每码人数<input name="usageLimit" type="number" min={1} max={1000000} defaultValue={1} className={`${field} mt-1.5`} /></label></div><label className="block text-sm font-medium">自定义码（可选，仅单个）<input name="customCode" maxLength={32} placeholder="留空则生成 12 位十六进制码" className={`${field} mt-1.5 font-mono uppercase`} /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">开始时间<input name="notBefore" type="datetime-local" className={`${field} mt-1.5`} /></label><label className="text-sm font-medium">结束时间<input name="expiresAt" type="datetime-local" className={`${field} mt-1.5`} /></label></div><button type="submit" disabled={pending || (rewardType === 'novel' && !selectedNovel)} className="min-h-11 w-full rounded-xl bg-[#7f56d9] px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? '正在创建…' : '创建兑换码'}</button></div>{createdCodes.length > 0 && <div id="created-codes" className="mt-5 rounded-2xl bg-[#101828] p-4 text-white"><div className="flex items-center justify-between"><strong className="text-sm">仅本次显示</strong><button type="button" onClick={() => navigator.clipboard.writeText(createdCodes.join('\n'))} className="text-xs text-[#84adff]">复制全部</button></div><pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-sm leading-7 text-[#d1e0ff]">{createdCodes.join('\n')}</pre></div>}</form><section className="space-y-3"><h2 className="text-lg font-semibold">最近兑换码</h2>{codes.map((code) => <article key={code.id} className="flex flex-col gap-3 rounded-2xl border border-[#e4e7ec] bg-white p-4 dark:border-white/10 dark:bg-[#172033] sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><strong className="font-mono">{code.codePrefix}••••••••</strong><p className="mt-1 text-sm text-[#667085]">{code.label || (code.rewardType === 'novel' ? '图书兑换码' : `${code.planCode?.toUpperCase()} 会员`)} · {code.redeemedCount}/{code.usageLimit} 人</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${code.enabled ? 'bg-[#ecfdf3] text-[#027a48]' : 'bg-[#f2f4f7] text-[#667085]'}`}>{code.enabled ? '使用中' : '已停用'}</span><button type="button" onClick={() => toggleCode(code)} className="min-h-10 rounded-xl border border-[#d0d5dd] px-3 text-sm font-semibold">{code.enabled ? '停用' : '启用'}</button></article>)}</section></div>}

    {tab === 'features' && <section className="grid gap-4 lg:grid-cols-2">{initialFeatures.map((feature) => <FeatureCard key={feature.key} feature={feature} />)}</section>}
  </div>;
}
