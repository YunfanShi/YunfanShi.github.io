'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import {
  saveAiModel,
  saveAiProvider,
  saveSubscriptionPlan,
  type AdminAiModel,
  type AdminAiProvider,
  type PlanCode,
  type SubscriptionPlanAdmin,
} from '@/actions/ai-admin';

type AdminData = Awaited<ReturnType<typeof import('@/actions/ai-admin').getAiAdminData>>;
type Tab = 'models' | 'plans' | 'providers' | 'usage';

const PLAN_CODES: PlanCode[] = ['free', 'plus', 'pro', 'ultra'];
const inputClass = 'mt-1.5 h-11 w-full rounded-xl border border-[#d0d5dd] bg-white px-3 text-sm outline-none transition focus:border-[#155eef] focus:ring-4 focus:ring-[#155eef]/10 dark:border-white/15 dark:bg-[#101828]';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium text-[#344054] dark:text-[#d0d5dd]">{label}{children}</label>;
}

export default function AiPlatformPanel({ initial }: { initial: AdminData }) {
  const providerBlank: AdminAiProvider & { api_key?: string } = { id: '', display_name: '', base_url: 'https://api.deepseek.com/v1', chat_model: '', reasoning_model: '', site_model: '', input_cost_per_million: 0, output_cost_per_million: 0, enabled: true, is_default: initial.providers.length === 0, has_api_key: false, api_key: '' };
  const modelBlank: AdminAiModel = { id: 0, provider_id: initial.providers[0]?.id ?? '', display_name: '', model_id: '', description: '', supports_chat: true, supports_agent: false, input_cost_per_million: 0, output_cost_per_million: 0, context_window: 0, enabled: true, sort_order: 100 };
  const [tab, setTab] = useState<Tab>('models');
  const [providers, setProviders] = useState(initial.providers);
  const [models, setModels] = useState(initial.models);
  const [access, setAccess] = useState(initial.modelAccess);
  const [plans, setPlans] = useState(initial.plans);
  const [providerDraft, setProviderDraft] = useState(providerBlank);
  const [modelDraft, setModelDraft] = useState(modelBlank);
  const [modelPlans, setModelPlans] = useState<PlanCode[]>([]);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const enabledModels = useMemo(() => models.filter((model) => model.enabled).length, [models]);

  const showNotice = (success: boolean, text: string) => setNotice({ tone: success ? 'ok' : 'error', text });
  const editModel = (model: AdminAiModel) => { setModelDraft(model); setModelPlans(access[model.id] ?? []); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const submitProvider = () => startTransition(async () => {
    const result = await saveAiProvider(providerDraft);
    showNotice(result.success, result.success ? '服务配置已加密保存。' : result.error ?? '保存失败。');
    if (!result.provider) return;
    const saved = result.provider;
    setProviders((items) => {
      const next = items.some((item) => item.id === saved.id) ? items.map((item) => item.id === saved.id ? saved : item) : [...items, saved];
      return saved.is_default ? next.map((item) => ({ ...item, is_default: item.id === saved.id })) : next;
    });
    setProviderDraft({ ...saved, api_key: '' });
  });

  const submitModel = () => startTransition(async () => {
    const result = await saveAiModel(modelDraft, modelPlans);
    showNotice(result.success, result.success ? '模型与套餐权限已保存。' : result.error ?? '保存失败。');
    if (!result.model) return;
    const saved = result.model;
    setModels((items) => items.some((item) => item.id === saved.id) ? items.map((item) => item.id === saved.id ? saved : item) : [...items, saved]);
    setAccess((value) => ({ ...value, [saved.id]: modelPlans }));
    setModelDraft(saved);
  });

  const submitPlan = (plan: SubscriptionPlanAdmin) => startTransition(async () => {
    const result = await saveSubscriptionPlan(plan);
    showNotice(result.success, result.success ? `${plan.display_name} 套餐额度已保存。` : result.error ?? '保存失败。');
  });

  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-3">
      <Summary label="可用模型" value={enabledModels} />
      <Summary label="服务连接" value={providers.filter((provider) => provider.enabled && provider.has_api_key).length} />
      <Summary label="近 30 天请求" value={initial.usage.requests.toLocaleString()} />
    </section>

    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[#e4e7ec] bg-white p-1.5 dark:border-white/10 dark:bg-[#182230]">
      {([['models', '模型与权限', 'model_training'], ['plans', '套餐额度', 'workspace_premium'], ['providers', '服务连接', 'dns'], ['usage', '用量成本', 'monitoring']] as const).map(([id, label, icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium transition ${tab === id ? 'bg-[#155eef] text-white shadow-sm' : 'text-[#475467] hover:bg-[#f2f4f7] dark:text-[#cbd5e1] dark:hover:bg-white/10'}`}><span className="material-icons-round text-lg">{icon}</span>{label}</button>)}
    </div>

    {notice && <div role="status" className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${notice.tone === 'ok' ? 'border-[#abefc6] bg-[#ecfdf3] text-[#067647]' : 'border-[#fecdca] bg-[#fef3f2] text-[#b42318]'}`}><span className="material-icons-round text-lg">{notice.tone === 'ok' ? 'check_circle' : 'error'}</span>{notice.text}</div>}

    {tab === 'models' && <ModelsTab models={models} providers={providers} access={access} draft={modelDraft} setDraft={setModelDraft} selectedPlans={modelPlans} setSelectedPlans={setModelPlans} pending={pending} onEdit={editModel} onNew={() => { setModelDraft({ ...modelBlank, provider_id: providers[0]?.id ?? '' }); setModelPlans([]); }} onSave={submitModel} />}
    {tab === 'plans' && <PlansTab plans={plans} setPlans={setPlans} models={models} access={access} pending={pending} onSave={submitPlan} />}
    {tab === 'providers' && <ProvidersTab providers={providers} draft={providerDraft} setDraft={setProviderDraft} blank={providerBlank} pending={pending} onSave={submitProvider} />}
    {tab === 'usage' && <UsageTab usage={initial.usage} />}
  </div>;
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-[#e4e7ec] bg-white p-4 dark:border-white/10 dark:bg-[#182230]"><p className="text-xs text-[#667085]">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}

function ModelsTab({ models, providers, access, draft, setDraft, selectedPlans, setSelectedPlans, pending, onEdit, onNew, onSave }: { models: AdminAiModel[]; providers: AdminAiProvider[]; access: Record<number, PlanCode[]>; draft: AdminAiModel; setDraft: (value: AdminAiModel) => void; selectedPlans: PlanCode[]; setSelectedPlans: React.Dispatch<React.SetStateAction<PlanCode[]>>; pending: boolean; onEdit: (model: AdminAiModel) => void; onNew: () => void; onSave: () => void }) {
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
    <section className="overflow-hidden rounded-2xl border border-[#e4e7ec] bg-white dark:border-white/10 dark:bg-[#182230]">
      <div className="flex items-center justify-between border-b border-[#eaecf0] p-5 dark:border-white/10"><div><h2 className="font-semibold">模型目录</h2><p className="mt-1 text-sm text-[#667085]">用户只会看到当前套餐已授权的模型。</p></div><button type="button" onClick={onNew} className="rounded-xl bg-[#155eef] px-3 py-2 text-sm font-semibold text-white">新增模型</button></div>
      <div className="divide-y divide-[#eaecf0] dark:divide-white/10">{models.length ? models.map((model) => <button key={model.id} type="button" onClick={() => onEdit(model)} className={`flex w-full items-start gap-4 p-4 text-left transition hover:bg-[#f9fafb] dark:hover:bg-white/5 ${draft.id === model.id ? 'bg-[#eff4ff] dark:bg-[#155eef]/10' : ''}`}><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${model.enabled ? 'bg-[#17b26a]' : 'bg-[#98a2b3]'}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong>{model.display_name}</strong>{model.supports_agent && <span className="rounded-full bg-[#f4ebff] px-2 py-0.5 text-[11px] font-medium text-[#6941c6]">Agent</span>}</div><p className="mt-1 truncate text-xs text-[#667085]">{providers.find((provider) => provider.id === model.provider_id)?.display_name ?? '未知服务'} · {model.model_id}</p><div className="mt-2 flex flex-wrap gap-1">{(access[model.id] ?? []).map((plan) => <span key={plan} className="rounded-md bg-[#f2f4f7] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#475467]">{plan}</span>)}</div></div><span className="material-icons-round text-[#98a2b3]">chevron_right</span></button>) : <p className="p-8 text-center text-sm text-[#667085]">还没有可选择的模型，请先添加一个服务连接和模型。</p>}</div>
    </section>
    <section className="h-fit rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]">
      <div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#155eef]">{draft.id ? '编辑模型' : '新模型'}</p><h2 className="mt-1 text-lg font-semibold">模型能力与套餐</h2></div>
      <div className="space-y-4">
        <Field label="服务连接"><select className={inputClass} value={draft.provider_id} onChange={(e) => setDraft({ ...draft, provider_id: e.target.value })}><option value="">选择服务</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.display_name}</option>)}</select></Field>
        <Field label="显示名称"><input className={inputClass} value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} placeholder="例如 GLM Flash" /></Field>
        <Field label="模型 ID"><input className={inputClass} value={draft.model_id} onChange={(e) => setDraft({ ...draft, model_id: e.target.value })} placeholder="上游模型标识" /></Field>
        <Field label="说明"><input className={inputClass} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="用户选择模型时可见" /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="输入价 / 1M"><input className={inputClass} type="number" min="0" step="0.0001" value={draft.input_cost_per_million} onChange={(e) => setDraft({ ...draft, input_cost_per_million: Number(e.target.value) })} /></Field><Field label="输出价 / 1M"><input className={inputClass} type="number" min="0" step="0.0001" value={draft.output_cost_per_million} onChange={(e) => setDraft({ ...draft, output_cost_per_million: Number(e.target.value) })} /></Field></div>
        <Field label="上下文窗口"><input className={inputClass} type="number" min="0" value={draft.context_window} onChange={(e) => setDraft({ ...draft, context_window: Number(e.target.value) })} placeholder="0 表示不显示" /></Field>
        <div><p className="text-sm font-medium">能力</p><div className="mt-2 flex flex-wrap gap-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={draft.supports_chat} onChange={(e) => setDraft({ ...draft, supports_chat: e.target.checked })} />聊天</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.supports_agent} onChange={(e) => setDraft({ ...draft, supports_agent: e.target.checked })} />Agent</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />启用</label></div></div>
        <div><p className="text-sm font-medium">允许使用的套餐</p><div className="mt-2 grid grid-cols-2 gap-2">{PLAN_CODES.map((plan) => <label key={plan} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-semibold uppercase transition ${selectedPlans.includes(plan) ? 'border-[#155eef] bg-[#eff4ff] text-[#155eef]' : 'border-[#e4e7ec] dark:border-white/10'}`}><input type="checkbox" checked={selectedPlans.includes(plan)} onChange={(e) => setSelectedPlans((items) => e.target.checked ? [...items, plan] : items.filter((item) => item !== plan))} />{plan}</label>)}</div></div>
        <button type="button" disabled={pending || !draft.provider_id || !draft.display_name.trim() || !draft.model_id.trim()} onClick={onSave} className="h-11 w-full rounded-xl bg-[#101828] text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-[#101828]">{pending ? '保存中…' : '保存模型与权限'}</button>
      </div>
    </section>
  </div>;
}

function PlansTab({ plans, setPlans, models, access, pending, onSave }: { plans: SubscriptionPlanAdmin[]; setPlans: React.Dispatch<React.SetStateAction<SubscriptionPlanAdmin[]>>; models: AdminAiModel[]; access: Record<number, PlanCode[]>; pending: boolean; onSave: (plan: SubscriptionPlanAdmin) => void }) {
  return <section className="grid gap-4 xl:grid-cols-4">{plans.map((plan, index) => <article key={plan.code} className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-[#155eef]">{plan.code}</p><h2 className="mt-1 text-lg font-semibold">{plan.display_name}</h2></div><span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-xs text-[#475467]">{models.filter((model) => (access[model.id] ?? []).includes(plan.code)).length} 个模型</span></div>{([['daily_token_limit','每日 Token'],['monthly_token_limit','每月 Token'],['max_output_tokens','单次最大输出'],['monthly_site_generations','网站生成/月']] as const).map(([key,label]) => <Field key={key} label={label}><input className={inputClass} type="number" min={key === 'max_output_tokens' ? 1 : 0} value={plan[key]} onChange={(e) => setPlans((all) => all.map((item, i) => i === index ? { ...item, [key]: Number(e.target.value) } : item))} /></Field>)}<button type="button" disabled={pending} onClick={() => onSave(plans[index])} className="mt-5 h-10 w-full rounded-xl bg-[#101828] text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-[#101828]">保存额度</button></article>)}</section>;
}

function ProvidersTab({ providers, draft, setDraft, blank, pending, onSave }: { providers: AdminAiProvider[]; draft: AdminAiProvider & { api_key?: string }; setDraft: (value: AdminAiProvider & { api_key?: string }) => void; blank: AdminAiProvider & { api_key?: string }; pending: boolean; onSave: () => void }) {
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
    <section className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><div className="flex items-center justify-between"><div><h2 className="font-semibold">服务连接</h2><p className="mt-1 text-sm text-[#667085]">密钥仅在服务端解密，不会回传浏览器。</p></div><button type="button" onClick={() => setDraft(blank)} className="rounded-xl border border-[#d0d5dd] px-3 py-2 text-sm font-semibold">新增</button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{providers.map((provider) => <button key={provider.id} type="button" onClick={() => setDraft({ ...provider, api_key: '' })} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${draft.id === provider.id ? 'border-[#155eef] bg-[#eff4ff] dark:bg-[#155eef]/10' : 'border-[#eaecf0] dark:border-white/10'}`}><div className="flex items-center justify-between gap-2"><strong>{provider.display_name}</strong><span className={`h-2.5 w-2.5 rounded-full ${provider.enabled && provider.has_api_key ? 'bg-[#17b26a]' : 'bg-[#98a2b3]'}`} /></div><p className="mt-2 truncate text-xs text-[#667085]">{provider.base_url}</p><p className="mt-1 truncate text-xs text-[#667085]">默认：{provider.chat_model}</p>{provider.is_default && <span className="mt-3 inline-block rounded-full bg-[#d1e9ff] px-2 py-1 text-[10px] font-semibold text-[#175cd3]">默认连接</span>}</button>)}</div></section>
    <section className="h-fit rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><h2 className="font-semibold">{draft.id ? '编辑连接' : '新增连接'}</h2><div className="mt-4 space-y-4"><Field label="连接名称"><input className={inputClass} value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} /></Field><Field label="API Base URL"><input className={inputClass} value={draft.base_url} onChange={(e) => setDraft({ ...draft, base_url: e.target.value })} /></Field><Field label="API Key"><input className={inputClass} type="password" placeholder={draft.has_api_key ? '已保存；留空不更换' : '首次保存必须填写'} value={draft.api_key ?? ''} onChange={(e) => setDraft({ ...draft, api_key: e.target.value })} /></Field><Field label="兼容默认模型"><input className={inputClass} value={draft.chat_model} onChange={(e) => setDraft({ ...draft, chat_model: e.target.value })} /></Field><div className="flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />启用</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.is_default} onChange={(e) => setDraft({ ...draft, is_default: e.target.checked })} />设为默认</label></div><button type="button" disabled={pending} onClick={onSave} className="h-11 w-full rounded-xl bg-[#155eef] text-sm font-semibold text-white disabled:opacity-50">{pending ? '保存中…' : '保存连接'}</button></div></section>
  </div>;
}

function UsageTab({ usage }: { usage: AdminData['usage'] }) {
  return <section className="rounded-2xl border border-[#e4e7ec] bg-white p-6 dark:border-white/10 dark:bg-[#182230]"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#155eef]">过去 30 天</p><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Summary label="计费 Token" value={usage.billedTokens.toLocaleString()} /><Summary label="输入 Token" value={usage.inputTokens.toLocaleString()} /><Summary label="输出 Token" value={usage.outputTokens.toLocaleString()} /><Summary label="估算成本" value={`¥${usage.estimatedCost.toFixed(4)}`} /></div></section>;
}
