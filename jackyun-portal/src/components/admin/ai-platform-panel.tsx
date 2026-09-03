'use client';

import { useState, useTransition } from 'react';
import { saveAiProvider, saveSubscriptionPlan, type AdminAiProvider, type SubscriptionPlanAdmin } from '@/actions/ai-admin';

type AdminData = Awaited<ReturnType<typeof import('@/actions/ai-admin').getAiAdminData>>;

export default function AiPlatformPanel({ initial }: { initial: AdminData }) {
  const blank: AdminAiProvider & { api_key?: string } = { id: '', display_name: '', base_url: 'https://api.deepseek.com/v1', chat_model: '', reasoning_model: '', site_model: '', input_cost_per_million: 0, output_cost_per_million: 0, enabled: true, is_default: initial.providers.length === 0, has_api_key: false, api_key: '' };
  const [draft, setDraft] = useState(blank);
  const [plans, setPlans] = useState(initial.plans);
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();
  const inputClass = 'h-10 w-full rounded-lg border border-[#d0d5dd] bg-transparent px-3 text-sm dark:border-white/15';
  const submitProvider = () => startTransition(async () => { const result = await saveAiProvider(draft); setNotice(result.success ? '模型配置已加密保存。' : result.error ?? '保存失败。'); if (result.success) window.location.reload(); });
  const submitPlan = (plan: SubscriptionPlanAdmin) => startTransition(async () => { const result = await saveSubscriptionPlan(plan); setNotice(result.success ? `${plan.display_name} 套餐已保存。` : result.error ?? '保存失败。'); });
  return <div className="space-y-6">
    {notice && <p role="status" className="rounded-xl bg-[#eff8ff] p-3 text-sm text-[#175cd3]">{notice}</p>}
    <section className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]">
      <h2 className="font-semibold">云端模型配置</h2><p className="mt-1 text-sm text-[#667085]">API Key 加密保存且不回传浏览器；模型 ID 由管理员填写，避免固定列表过期。</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <input className={inputClass} placeholder="配置名称" value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} />
        <input className={inputClass} placeholder="API Base URL" value={draft.base_url} onChange={(e) => setDraft({ ...draft, base_url: e.target.value })} />
        <input className={inputClass} type="password" placeholder={draft.has_api_key ? '已保存；留空不更换' : 'API Key'} value={draft.api_key ?? ''} onChange={(e) => setDraft({ ...draft, api_key: e.target.value })} />
        <input className={inputClass} placeholder="普通模型 ID" value={draft.chat_model} onChange={(e) => setDraft({ ...draft, chat_model: e.target.value })} />
        <input className={inputClass} placeholder="推理模型 ID（可选）" value={draft.reasoning_model ?? ''} onChange={(e) => setDraft({ ...draft, reasoning_model: e.target.value })} />
        <input className={inputClass} placeholder="网站生成模型 ID（可选）" value={draft.site_model ?? ''} onChange={(e) => setDraft({ ...draft, site_model: e.target.value })} />
        <label className="text-xs text-[#667085]">输入成本 / 百万 Token<input className={`${inputClass} mt-1`} type="number" min="0" step="0.0001" value={draft.input_cost_per_million} onChange={(e) => setDraft({ ...draft, input_cost_per_million: Number(e.target.value) })} /></label>
        <label className="text-xs text-[#667085]">输出成本 / 百万 Token<input className={`${inputClass} mt-1`} type="number" min="0" step="0.0001" value={draft.output_cost_per_million} onChange={(e) => setDraft({ ...draft, output_cost_per_million: Number(e.target.value) })} /></label>
        <div className="flex items-center gap-4 text-sm"><label><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> 启用</label><label><input type="checkbox" checked={draft.is_default} onChange={(e) => setDraft({ ...draft, is_default: e.target.checked })} /> 默认</label></div>
      </div>
      <div className="mt-4 flex gap-2"><button disabled={pending} onClick={submitProvider} className="rounded-xl bg-[#155eef] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">保存配置</button>{draft.id && <button onClick={() => setDraft(blank)} className="rounded-xl border px-4 py-2 text-sm">新增配置</button>}</div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">{initial.providers.map((provider) => <button key={provider.id} onClick={() => setDraft({ ...provider, api_key: '' })} className="rounded-xl border border-[#eaecf0] p-4 text-left dark:border-white/10"><div className="flex justify-between"><strong>{provider.display_name}</strong><span className="text-xs">{provider.is_default ? '默认' : provider.enabled ? '启用' : '停用'}</span></div><p className="mt-2 truncate text-xs text-[#667085]">{provider.base_url}</p><p className="mt-1 text-xs text-[#667085]">{provider.chat_model} · Key {provider.has_api_key ? '已保存' : '未配置'}</p></button>)}</div>
    </section>
    <section className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><h2 className="font-semibold">Token 套餐</h2><div className="mt-4 grid gap-4 xl:grid-cols-4">{plans.map((plan, index) => <article key={plan.code} className="rounded-xl border border-[#eaecf0] p-4 dark:border-white/10"><h3 className="font-semibold">{plan.display_name}</h3>{([['daily_token_limit','每日 Token'],['monthly_token_limit','每月 Token'],['max_output_tokens','单次最大输出'],['monthly_site_generations','网站生成/月']] as const).map(([key,label]) => <label key={key} className="mt-3 block text-xs text-[#667085]">{label}<input className={`${inputClass} mt-1`} type="number" min={key === 'max_output_tokens' ? 1 : 0} value={plan[key]} onChange={(e) => setPlans((all) => all.map((item, i) => i === index ? { ...item, [key]: Number(e.target.value) } : item))} /></label>)}<button disabled={pending} onClick={() => submitPlan(plans[index])} className="mt-4 w-full rounded-lg bg-[#101828] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">保存套餐</button></article>)}</div></section>
    <section className="grid gap-4 md:grid-cols-2">
      <article className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><h2 className="font-semibold">近 30 天 AI 用量</h2><p className="mt-4 text-3xl font-bold">{initial.usage.billedTokens.toLocaleString()}</p><p className="text-sm text-[#667085]">计费 Token · {initial.usage.requests} 次成功请求</p><p className="mt-2 text-sm text-[#667085]">输入 {initial.usage.inputTokens.toLocaleString()} · 输出 {initial.usage.outputTokens.toLocaleString()} · 估算 ¥{initial.usage.estimatedCost.toFixed(4)}</p></article>
      <article className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><h2 className="font-semibold">AI 界面备份</h2><div className="mt-3 max-h-52 space-y-2 overflow-y-auto">{initial.backups.length ? initial.backups.map((item) => <details key={item.id} className="rounded-lg bg-[#f9fafb] p-3 text-xs dark:bg-white/5"><summary className="cursor-pointer font-medium">{item.summary || '界面微调'}</summary><p className="mt-1 text-[#667085]">用户 {item.user_id} · {new Date(item.created_at).toLocaleString('zh-CN')}</p><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[10px]">修改前：{JSON.stringify(item.before_config, null, 2)}{`\n`}修改后：{JSON.stringify(item.after_config, null, 2)}</pre></details>) : <p className="text-sm text-[#667085]">暂无备份</p>}</div></article>
    </section>
  </div>;
}
