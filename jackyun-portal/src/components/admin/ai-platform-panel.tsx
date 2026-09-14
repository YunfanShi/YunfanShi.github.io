'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import {
  discoverAiProviderModels,
  deleteAiModel,
  importAiProviderModels,
  saveAiHealthSettings,
  saveDefaultAiModel,
  saveAiModel,
  saveEnabledAiModels,
  savePlanAiModelAccess,
  saveSmartRouterModel,
  saveAiProvider,
  saveSubscriptionPlan,
  setAiModelEnabled,
  type AdminAiModel,
  type AdminAiProvider,
  type PlanCode,
  type SubscriptionPlanAdmin,
} from '@/actions/ai-admin';
import type { DiscoveredAiModel } from '@/lib/ai-provider-models';
import { AI_PROVIDER_PRESETS } from '@/lib/ai-provider-presets';
import { AI_MODEL_CAPABILITIES, AI_MODEL_CAPABILITY_LABELS } from '@/lib/ai-model-capabilities';

type AdminData = Awaited<ReturnType<typeof import('@/actions/ai-admin').getAiAdminData>>;
type Tab = 'models' | 'plans' | 'providers' | 'usage';

const PLAN_CODES: PlanCode[] = ['free', 'plus', 'pro', 'ultra'];
const AGENT_CAPABILITIES = ['agent', 'tools'] as const;
const inputClass = 'mt-1.5 h-11 w-full rounded-xl border border-[#d0d5dd] bg-white px-3 text-sm outline-none transition focus:border-[#155eef] focus:ring-4 focus:ring-[#155eef]/10 dark:border-white/15 dark:bg-[#101828]';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium text-[#344054] dark:text-[#d0d5dd]">{label}{children}</label>;
}

export default function AiPlatformPanel({ initial }: { initial: AdminData }) {
  const providerBlank: AdminAiProvider & { api_key?: string } = { id: '', display_name: '', base_url: 'https://api.deepseek.com/v1', chat_model: '', reasoning_model: '', site_model: '', input_cost_per_million: 0, output_cost_per_million: 0, enabled: true, is_default: initial.providers.length === 0, has_api_key: false, api_key: '' };
  const modelBlank: AdminAiModel = { id: 0, provider_id: initial.providers[0]?.id ?? '', display_name: '', model_id: '', description: '', routing_description: '', capabilities: [], supports_chat: true, supports_agent: false, input_cost_per_million: 0, output_cost_per_million: 0, context_window: 0, enabled: true, sort_order: 100, consecutive_failures: 0, last_failure_detail: null, last_failure_at: null, auto_disabled_at: null, auto_disabled_reason: null, total_error_count: 0, last_error_detail: null, last_error_at: null, test_run_count: 0, test_attempt_count: 0, last_test_at: null, last_test_available: null, last_test_attempt_count: null, last_test_connection_ms: null, last_test_first_token_ms: null, last_test_total_ms: null, last_test_tokens_per_second: null, last_test_log: [] };
  const [tab, setTab] = useState<Tab>('models');
  const [providers, setProviders] = useState(initial.providers);
  const [models, setModels] = useState(initial.models);
  const [access, setAccess] = useState(initial.modelAccess);
  const [smartRouterModelId, setSmartRouterModelId] = useState<number | null>(initial.smartRouterModelId);
  const [defaultModelId, setDefaultModelId] = useState<number | null>(initial.defaultModelId);
  const [failureThreshold, setFailureThreshold] = useState(initial.modelFailureThreshold);
  const [plans, setPlans] = useState(initial.plans);
  const [providerDraft, setProviderDraft] = useState(providerBlank);
  const [modelDraft, setModelDraft] = useState(modelBlank);
  const [modelPlans, setModelPlans] = useState<PlanCode[]>([]);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredAiModel[]>([]);
  const [discoveredSelection, setDiscoveredSelection] = useState<string[]>([]);
  const [importPlans, setImportPlans] = useState<PlanCode[]>([]);
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
    setModels((items) => (items.some((item) => item.id === saved.id) ? items.map((item) => item.id === saved.id ? saved : item) : [...items, saved]).toSorted((a, b) => a.sort_order - b.sort_order || a.id - b.id));
    setAccess((value) => ({ ...value, [saved.id]: modelPlans }));
    setModelDraft(saved);
  });

  const submitPlan = (plan: SubscriptionPlanAdmin) => startTransition(async () => {
    const result = await saveSubscriptionPlan(plan);
    showNotice(result.success, result.success ? `${plan.display_name} 套餐额度已保存。` : result.error ?? '保存失败。');
  });

  const discoverModels = () => startTransition(async () => {
    const result = await discoverAiProviderModels({ providerId: providerDraft.id || undefined, baseUrl: providerDraft.base_url, apiKey: providerDraft.api_key });
    showNotice(result.success, result.success ? `已读取 ${result.models?.length ?? 0} 个上游模型，请选择要加入平台的模型。` : result.error ?? '读取失败。');
    if (!result.models) return;
    setDiscoveredModels(result.models);
    setDiscoveredSelection(result.models.filter((item) => !models.some((model) => model.provider_id === providerDraft.id && model.model_id === item.modelId)).map((item) => item.modelId));
    if (!providerDraft.chat_model && result.models[0]) setProviderDraft({ ...providerDraft, chat_model: result.models[0].modelId });
  });

  const importModels = () => startTransition(async () => {
    const selected = discoveredModels.filter((model) => discoveredSelection.includes(model.modelId));
    const result = await importAiProviderModels(providerDraft.id, selected, importPlans);
    showNotice(result.success, result.success ? `已导入并启用 ${result.models?.length ?? 0} 个模型。` : result.error ?? '导入失败。');
    if (!result.models) return;
    setModels((items) => [...items.filter((item) => !result.models?.some((model) => model.id === item.id)), ...result.models!].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id));
    setAccess((current) => ({ ...current, ...Object.fromEntries(result.models!.map((model) => [model.id, [...new Set([...(current[model.id] ?? []), ...importPlans])]])) }));
  });

  const saveGlobalModels = (modelIds: number[]) => startTransition(async () => {
    const result = await saveEnabledAiModels(modelIds);
    showNotice(result.success, result.success ? '全局可用模型已保存。' : result.error ?? '保存失败。');
    if (result.success) setModels((items) => items.map((model) => ({ ...model, enabled: modelIds.includes(model.id) })));
  });

  const savePlanModels = (planCode: PlanCode, modelIds: number[]) => startTransition(async () => {
    const result = await savePlanAiModelAccess(planCode, modelIds);
    showNotice(result.success, result.success ? `${planCode.toUpperCase()} 套餐可用模型已保存。` : result.error ?? '保存失败。');
    if (result.success) setAccess((current) => Object.fromEntries(models.map((model) => [model.id, modelIds.includes(model.id) ? [...new Set([...(current[model.id] ?? []).filter((plan) => plan !== planCode), planCode])] : (current[model.id] ?? []).filter((plan) => plan !== planCode)])));
  });

  const saveSmartRouter = (modelId: number | null) => startTransition(async () => {
    const result = await saveSmartRouterModel(modelId);
    showNotice(result.success, result.success ? '智能选择判断模型已保存。' : result.error ?? '保存失败。');
    if (result.success) setSmartRouterModelId(modelId);
  });

  const saveDefaultModel = (modelId: number | null) => startTransition(async () => {
    const result = await saveDefaultAiModel(modelId);
    showNotice(result.success, result.success ? '平台默认模型已保存。' : result.error ?? '保存失败。');
    if (result.success) setDefaultModelId(modelId);
  });

  const saveHealthSettings = () => startTransition(async () => {
    const result = await saveAiHealthSettings(failureThreshold);
    showNotice(result.success, result.success ? '模型自动下架规则已保存。' : result.error ?? '保存失败。');
  });

  const toggleModel = (model: AdminAiModel) => startTransition(async () => {
    const enabled = !model.enabled;
    const result = await setAiModelEnabled(model.id, enabled);
    showNotice(result.success, result.success ? `模型已${enabled ? '重新上架' : '下架'}。` : result.error ?? '操作失败。');
    if (result.success) setModels((items) => items.map((item) => item.id === model.id ? { ...item, enabled, ...(enabled ? { consecutive_failures: 0, last_failure_detail: null, last_failure_at: null, auto_disabled_at: null, auto_disabled_reason: null } : {}) } : item));
  });

  const removeModel = (model: AdminAiModel) => {
    if (!window.confirm(`确定永久删除模型“${model.display_name}”吗？套餐授权与用量关联会一并解除，此操作不可撤销。`)) return;
    startTransition(async () => {
      const result = await deleteAiModel(model.id);
      showNotice(result.success, result.success ? '模型已永久删除。' : result.error ?? '删除失败。');
      if (!result.success) return;
      setModels((items) => items.filter((item) => item.id !== model.id));
      setAccess((current) => Object.fromEntries(Object.entries(current).filter(([id]) => Number(id) !== model.id)));
      if (smartRouterModelId === model.id) setSmartRouterModelId(null);
      if (defaultModelId === model.id) setDefaultModelId(null);
      if (modelDraft.id === model.id) setModelDraft(modelBlank);
    });
  };

  return <div className="space-y-5">
    <div className="flex justify-end"><Link href="/admin/ai/test" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#101828] px-4 text-sm font-semibold text-white dark:bg-white dark:text-[#101828]"><span className="material-icons-round text-lg">science</span>AI 模型测试</Link></div>
    <section className="grid gap-3 sm:grid-cols-3">
      <Summary label="可用模型" value={enabledModels} />
      <Summary label="服务连接" value={providers.filter((provider) => provider.enabled && provider.has_api_key).length} />
      <Summary label="近 30 天请求" value={initial.usage.requests.toLocaleString()} />
    </section>

    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[#e4e7ec] bg-white p-1.5 dark:border-white/10 dark:bg-[#182230]">
      {([['models', '模型与权限', 'model_training'], ['plans', '套餐额度', 'workspace_premium'], ['providers', '服务连接', 'dns'], ['usage', '用量成本', 'monitoring']] as const).map(([id, label, icon]) => <button key={id} type="button" onClick={() => setTab(id)} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium transition ${tab === id ? 'bg-[#155eef] text-white shadow-sm' : 'text-[#475467] hover:bg-[#f2f4f7] dark:text-[#cbd5e1] dark:hover:bg-white/10'}`}><span className="material-icons-round text-lg">{icon}</span>{label}</button>)}
    </div>

    {notice && <div role="status" className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${notice.tone === 'ok' ? 'border-[#abefc6] bg-[#ecfdf3] text-[#067647]' : 'border-[#fecdca] bg-[#fef3f2] text-[#b42318]'}`}><span className="material-icons-round text-lg">{notice.tone === 'ok' ? 'check_circle' : 'error'}</span>{notice.text}</div>}

    {tab === 'models' && <ModelsTab models={models} providers={providers} access={access} smartRouterModelId={smartRouterModelId} defaultModelId={defaultModelId} failureThreshold={failureThreshold} setFailureThreshold={setFailureThreshold} draft={modelDraft} setDraft={setModelDraft} selectedPlans={modelPlans} setSelectedPlans={setModelPlans} pending={pending} onEdit={editModel} onNew={() => { setModelDraft({ ...modelBlank, provider_id: providers[0]?.id ?? '' }); setModelPlans([]); }} onSave={submitModel} onSaveGlobal={saveGlobalModels} onSaveRouter={saveSmartRouter} onSaveDefault={saveDefaultModel} onSaveHealth={saveHealthSettings} onToggle={toggleModel} onDelete={removeModel} />}
    {tab === 'plans' && <PlansTab plans={plans} setPlans={setPlans} models={models} providers={providers} access={access} pending={pending} onSave={submitPlan} onSaveModels={savePlanModels} />}
    {tab === 'providers' && <ProvidersTab providers={providers} draft={providerDraft} setDraft={setProviderDraft} blank={providerBlank} pending={pending} onSave={submitProvider} discovered={discoveredModels} selected={discoveredSelection} setSelected={setDiscoveredSelection} importPlans={importPlans} setImportPlans={setImportPlans} onDiscover={discoverModels} onImport={importModels} />}
    {tab === 'usage' && <UsageTab usage={initial.usage} rows={initial.usageByProvider} />}
  </div>;
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-[#e4e7ec] bg-white p-4 dark:border-white/10 dark:bg-[#182230]"><p className="text-xs text-[#667085]">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}

function ModelsTab({ models, providers, access, smartRouterModelId, defaultModelId, failureThreshold, setFailureThreshold, draft, setDraft, selectedPlans, setSelectedPlans, pending, onEdit, onNew, onSave, onSaveGlobal, onSaveRouter, onSaveDefault, onSaveHealth, onToggle, onDelete }: { models: AdminAiModel[]; providers: AdminAiProvider[]; access: Record<number, PlanCode[]>; smartRouterModelId: number | null; defaultModelId: number | null; failureThreshold: number; setFailureThreshold: (value: number) => void; draft: AdminAiModel; setDraft: (value: AdminAiModel) => void; selectedPlans: PlanCode[]; setSelectedPlans: React.Dispatch<React.SetStateAction<PlanCode[]>>; pending: boolean; onEdit: (model: AdminAiModel) => void; onNew: () => void; onSave: () => void; onSaveGlobal: (modelIds: number[]) => void; onSaveRouter: (modelId: number | null) => void; onSaveDefault: (modelId: number | null) => void; onSaveHealth: () => void; onToggle: (model: AdminAiModel) => void; onDelete: (model: AdminAiModel) => void }) {
  const [globalIds, setGlobalIds] = useState(() => models.filter((model) => model.enabled).map((model) => model.id));
  const [routerId, setRouterId] = useState<number | null>(smartRouterModelId);
  const allSelected = models.length > 0 && globalIds.length === models.length;
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
    <section className="rounded-2xl border border-[#b2ccff] bg-[#eff4ff] p-5 dark:border-[#155eef]/40 dark:bg-[#155eef]/10 xl:col-span-2">
      <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#155eef]">模型路由与健康检查</p><h2 className="mt-1 font-semibold">平台默认与智能选择</h2><p className="mt-1 text-sm text-[#475467] dark:text-[#b2ccff]">未指定模型的功能使用平台默认模型；智能选择会先判断任务，再从用户套餐允许的模型中选择。只有确定的上游配置故障才累计自动下架。</p></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-[1fr_auto_1fr_auto_160px_auto] xl:items-end">
        <label className="text-sm font-medium">平台默认模型<select aria-label="平台默认模型" className={inputClass} value={defaultModelId ?? ''} onChange={(event) => onSaveDefault(event.target.value ? Number(event.target.value) : null)}><option value="">沿用旧版默认连接</option>{models.filter((model) => model.enabled && model.supports_chat).map((model) => <option key={model.id} value={model.id}>{model.display_name} · {providers.find((provider) => provider.id === model.provider_id)?.display_name ?? '未知服务'}</option>)}</select></label>
        <span className="hidden text-xs text-[#667085] xl:block">选择后立即保存</span>
        <label className="text-sm font-medium">用于智能判断的模型<select aria-label="智能选择判断模型" className={inputClass} value={routerId ?? ''} onChange={(event) => setRouterId(event.target.value ? Number(event.target.value) : null)}><option value="">关闭智能选择</option>{models.filter((model) => model.enabled && model.supports_chat).map((model) => <option key={model.id} value={model.id}>{model.display_name} · {providers.find((provider) => provider.id === model.provider_id)?.display_name ?? '未知服务'}</option>)}</select></label>
        <button type="button" disabled={pending} onClick={() => onSaveRouter(routerId)} className="h-11 rounded-xl bg-[#155eef] px-4 text-sm font-semibold text-white disabled:opacity-50">保存智能选择</button>
        <label className="text-sm font-medium">失败下架阈值<input aria-label="连续失败下架阈值" className={inputClass} type="number" min="1" max="10" value={failureThreshold} onChange={(event) => setFailureThreshold(Number(event.target.value))} /></label>
        <button type="button" disabled={pending || !Number.isSafeInteger(failureThreshold) || failureThreshold < 1 || failureThreshold > 10} onClick={onSaveHealth} className="h-11 rounded-xl border border-[#155eef] px-4 text-sm font-semibold text-[#155eef] disabled:opacity-50">保存阈值</button>
      </div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-[#e4e7ec] bg-white dark:border-white/10 dark:bg-[#182230]">
      <div className="border-b border-[#eaecf0] p-5 dark:border-white/10"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">全局可用模型</h2><p className="mt-1 text-sm text-[#667085]">先多选平台开放的模型，再到套餐页分配可用范围。</p></div><button type="button" onClick={onNew} className="rounded-xl bg-[#155eef] px-3 py-2 text-sm font-semibold text-white">新增模型</button></div><div className="mt-4 flex flex-wrap items-center gap-3"><label className="flex cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" checked={allSelected} onChange={(event) => setGlobalIds(event.target.checked ? models.map((model) => model.id) : [])} />全选全部模型</label><span className="text-xs text-[#667085]">已选 {globalIds.length} / {models.length}</span><button type="button" disabled={pending} onClick={() => onSaveGlobal(globalIds)} className="ml-auto rounded-xl bg-[#101828] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-[#101828]">保存全局可用模型</button></div></div>
      <div className="divide-y divide-[#eaecf0] dark:divide-white/10">{models.length ? models.map((model) => (
        <div key={model.id} className={`flex items-start gap-3 p-4 transition hover:bg-[#f9fafb] dark:hover:bg-white/5 ${draft.id === model.id ? 'bg-[#eff4ff] dark:bg-[#155eef]/10' : ''}`}>
          <input aria-label={`全局启用 ${model.display_name}`} className="mt-1" type="checkbox" checked={globalIds.includes(model.id)} onChange={(event) => setGlobalIds((items) => event.target.checked ? [...items, model.id] : items.filter((id) => id !== model.id))} />
          <div className="min-w-0 flex-1">
            <button type="button" onClick={() => onEdit(model)} className="w-full text-left">
              <div className="flex flex-wrap items-center gap-2"><strong>{model.display_name}</strong>{model.id === defaultModelId && <span className="rounded-full bg-[#dcfae6] px-2 py-0.5 text-[11px] font-medium text-[#067647]">平台默认</span>}{model.id === smartRouterModelId && <span className="rounded-full bg-[#d1e9ff] px-2 py-0.5 text-[11px] font-medium text-[#175cd3]">智能判断</span>}{!model.enabled && <span className="rounded-full bg-[#fee4e2] px-2 py-0.5 text-[11px] font-medium text-[#b42318]">已下架</span>}{model.auto_disabled_at && <span className="rounded-full bg-[#fef0c7] px-2 py-0.5 text-[11px] font-medium text-[#b54708]">自动下架</span>}</div>
              <p className="mt-1 truncate text-xs text-[#667085]">顺序 {model.sort_order} · {providers.find((provider) => provider.id === model.provider_id)?.display_name ?? '未知服务'} · {model.model_id}</p>
              <p className="mt-2 max-h-16 overflow-y-auto whitespace-normal break-words rounded-lg bg-[#f9fafb] p-2 text-xs leading-5 text-[#475467] dark:bg-white/5 dark:text-[#cbd5e1]">{model.description || '未填写用户可见说明'}</p>
            </button>
            <div className="mt-2 flex flex-wrap gap-1">{model.capabilities.map((capability) => <span key={capability} className="rounded-md bg-[#f4ebff] px-1.5 py-0.5 text-[10px] font-medium text-[#6941c6]">{AI_MODEL_CAPABILITY_LABELS[capability]}</span>)}{(access[model.id] ?? []).map((plan) => <span key={plan} className="rounded-md bg-[#f2f4f7] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#475467]">{plan}</span>)}</div>
            {model.consecutive_failures > 0 && <p className="mt-2 text-[11px] text-[#b54708]">连续确认故障 {model.consecutive_failures} 次{model.last_failure_detail ? ` · ${model.last_failure_detail}` : ''}</p>}
            <div className="mt-3 flex gap-2"><button type="button" disabled={pending} onClick={() => { setGlobalIds((items) => model.enabled ? items.filter((id) => id !== model.id) : [...new Set([...items, model.id])]); onToggle(model); }} className="rounded-lg border border-[#d0d5dd] px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50">{model.enabled ? '下架' : '重新上架'}</button><button type="button" disabled={pending} onClick={() => { setGlobalIds((items) => items.filter((id) => id !== model.id)); onDelete(model); }} className="rounded-lg border border-[#fda29b] px-2.5 py-1.5 text-xs font-semibold text-[#b42318] disabled:opacity-50">永久删除</button></div>
          </div>
        </div>
      )) : <p className="p-8 text-center text-sm text-[#667085]">还没有模型，请先在“服务连接”中读取聚合平台模型。</p>}</div>
    </section>
    <section className="h-fit rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]">
      <div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#155eef]">{draft.id ? '编辑模型' : '新模型'}</p><h2 className="mt-1 text-lg font-semibold">模型能力与套餐</h2></div>
      <div className="space-y-4">
        <Field label="服务连接"><select className={inputClass} value={draft.provider_id} onChange={(e) => setDraft({ ...draft, provider_id: e.target.value })}><option value="">选择服务</option>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.display_name}</option>)}</select></Field>
        <Field label="显示名称"><input className={inputClass} value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} placeholder="例如 GLM Flash" /></Field>
        <Field label="模型 ID"><input className={inputClass} value={draft.model_id} onChange={(e) => setDraft({ ...draft, model_id: e.target.value })} placeholder="上游模型标识" /></Field>
        <Field label="给用户看的简短说明"><input className={inputClass} maxLength={240} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="例如：擅长快速问答与中文写作" /></Field>
        <Field label="给智能选择 AI 的详细说明"><textarea className={`${inputClass} h-28 py-3`} maxLength={2000} value={draft.routing_description} onChange={(e) => setDraft({ ...draft, routing_description: e.target.value })} placeholder="详细描述擅长任务、限制、速度与成本取舍；不会直接展示给用户" /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="输入价 / 1M"><input className={inputClass} type="number" min="0" step="0.0001" value={draft.input_cost_per_million} onChange={(e) => setDraft({ ...draft, input_cost_per_million: Number(e.target.value) })} /></Field><Field label="输出价 / 1M"><input className={inputClass} type="number" min="0" step="0.0001" value={draft.output_cost_per_million} onChange={(e) => setDraft({ ...draft, output_cost_per_million: Number(e.target.value) })} /></Field></div>
        <Field label="上下文窗口"><input className={inputClass} type="number" min="0" value={draft.context_window} onChange={(e) => setDraft({ ...draft, context_window: Number(e.target.value) })} placeholder="0 表示不显示" /></Field>
        <Field label="模型列表顺序"><input className={inputClass} type="number" min="0" step="1" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} /><span className="mt-1 block text-xs font-normal text-[#667085]">数字越小越靠前；相同数字按模型创建顺序排列。</span></Field>
        <div><p className="text-sm font-medium">使用模式</p><div className="mt-2 flex flex-wrap gap-3 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={draft.supports_chat} onChange={(e) => setDraft({ ...draft, supports_chat: e.target.checked })} />聊天</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.supports_agent} onChange={(e) => setDraft({ ...draft, supports_agent: e.target.checked, capabilities: e.target.checked ? [...new Set([...draft.capabilities, ...AGENT_CAPABILITIES])] : draft.capabilities.filter((item) => item !== 'agent') })} />Agent</label><label className="flex items-center gap-2"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />启用</label></div></div>
        <div><p className="text-sm font-medium">能力标签（用户与智能选择均可见）</p><div className="mt-2 grid grid-cols-2 gap-2">{AI_MODEL_CAPABILITIES.map((capability) => <label key={capability} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-xs font-medium ${draft.capabilities.includes(capability) ? 'border-[#7f56d9] bg-[#f4ebff] text-[#6941c6]' : 'border-[#e4e7ec] dark:border-white/10'}`}><input type="checkbox" checked={draft.capabilities.includes(capability)} onChange={(event) => setDraft({ ...draft, capabilities: event.target.checked ? [...new Set([...draft.capabilities, capability])] : draft.capabilities.filter((item) => item !== capability), ...(capability === 'agent' ? { supports_agent: event.target.checked } : {}) })} />{AI_MODEL_CAPABILITY_LABELS[capability]}</label>)}</div></div>
        <div><p className="text-sm font-medium">允许使用的套餐</p><div className="mt-2 grid grid-cols-2 gap-2">{PLAN_CODES.map((plan) => <label key={plan} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-semibold uppercase transition ${selectedPlans.includes(plan) ? 'border-[#155eef] bg-[#eff4ff] text-[#155eef]' : 'border-[#e4e7ec] dark:border-white/10'}`}><input type="checkbox" checked={selectedPlans.includes(plan)} onChange={(e) => setSelectedPlans((items) => e.target.checked ? [...items, plan] : items.filter((item) => item !== plan))} />{plan}</label>)}</div></div>
        <button type="button" disabled={pending || !draft.provider_id || !draft.display_name.trim() || !draft.model_id.trim()} onClick={onSave} className="h-11 w-full rounded-xl bg-[#101828] text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-[#101828]">{pending ? '保存中…' : '保存模型与权限'}</button>
      </div>
    </section>
  </div>;
}

function PlansTab({ plans, setPlans, models, providers, access, pending, onSave, onSaveModels }: { plans: SubscriptionPlanAdmin[]; setPlans: React.Dispatch<React.SetStateAction<SubscriptionPlanAdmin[]>>; models: AdminAiModel[]; providers: AdminAiProvider[]; access: Record<number, PlanCode[]>; pending: boolean; onSave: (plan: SubscriptionPlanAdmin) => void; onSaveModels: (planCode: PlanCode, modelIds: number[]) => void }) {
  const availableModels = models.filter((model) => model.enabled);
  const [selections, setSelections] = useState<Record<PlanCode, number[]>>(() => Object.fromEntries(PLAN_CODES.map((plan) => [plan, availableModels.filter((model) => (access[model.id] ?? []).includes(plan)).map((model) => model.id)])) as Record<PlanCode, number[]>);
  return <section className="grid gap-4 xl:grid-cols-2">{plans.map((plan, index) => {
    const selected = selections[plan.code] ?? [];
    const allSelected = availableModels.length > 0 && selected.length === availableModels.length;
    return <article key={plan.code} className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]">
      <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase text-[#155eef]">{plan.code}</p><h2 className="mt-1 text-lg font-semibold">{plan.display_name}</h2></div><span className="rounded-full bg-[#f2f4f7] px-2 py-1 text-xs text-[#475467]">{selected.length} 个模型</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{([['daily_token_limit','每日 Token'],['monthly_token_limit','每月 Token'],['max_output_tokens','单次最大输出'],['monthly_site_generations','网站生成/月']] as const).map(([key,label]) => <Field key={key} label={label}><input className={inputClass} type="number" min={key === 'max_output_tokens' ? 1 : 0} value={plan[key]} onChange={(e) => setPlans((all) => all.map((item, i) => i === index ? { ...item, [key]: Number(e.target.value) } : item))} /></Field>)}</div>
      <button type="button" disabled={pending} onClick={() => onSave(plans[index])} className="mt-4 h-10 w-full rounded-xl border border-[#d0d5dd] text-sm font-semibold disabled:opacity-50 dark:border-white/15">保存额度</button>
      <div className="mt-5 border-t border-[#eaecf0] pt-4 dark:border-white/10"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">套餐可用模型</p><label className="flex cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={allSelected} onChange={(event) => setSelections((current) => ({ ...current, [plan.code]: event.target.checked ? availableModels.map((model) => model.id) : [] }))} />全选</label></div>
        <div className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-[#eaecf0] p-2 dark:border-white/10">{availableModels.length ? availableModels.map((model) => <label key={model.id} className="flex cursor-pointer items-start gap-2 rounded-lg p-2 text-sm hover:bg-[#f9fafb] dark:hover:bg-white/5"><input className="mt-0.5" type="checkbox" checked={selected.includes(model.id)} onChange={(event) => setSelections((current) => ({ ...current, [plan.code]: event.target.checked ? [...selected, model.id] : selected.filter((id) => id !== model.id) }))} /><span className="min-w-0"><span className="block truncate font-medium">{model.display_name}</span><span className="block truncate text-[11px] text-[#667085]">{providers.find((provider) => provider.id === model.provider_id)?.display_name ?? '未知 API'} · {model.model_id}</span></span></label>) : <p className="p-3 text-center text-xs text-[#667085]">请先选择全局可用模型。</p>}</div>
        <button type="button" disabled={pending} onClick={() => onSaveModels(plan.code, selected)} className="mt-3 h-10 w-full rounded-xl bg-[#155eef] text-sm font-semibold text-white disabled:opacity-50">保存套餐模型</button>
      </div>
    </article>;
  })}</section>;
}

function ProvidersTab({ providers, draft, setDraft, blank, pending, onSave, discovered, selected, setSelected, importPlans, setImportPlans, onDiscover, onImport }: { providers: AdminAiProvider[]; draft: AdminAiProvider & { api_key?: string }; setDraft: (value: AdminAiProvider & { api_key?: string }) => void; blank: AdminAiProvider & { api_key?: string }; pending: boolean; onSave: () => void; discovered: DiscoveredAiModel[]; selected: string[]; setSelected: React.Dispatch<React.SetStateAction<string[]>>; importPlans: PlanCode[]; setImportPlans: React.Dispatch<React.SetStateAction<PlanCode[]>>; onDiscover: () => void; onImport: () => void }) {
  const [query, setQuery] = useState('');
  const visible = discovered.filter((model) => `${model.displayName} ${model.modelId}`.toLowerCase().includes(query.trim().toLowerCase()));
  const allVisibleSelected = visible.length > 0 && visible.every((model) => selected.includes(model.modelId));
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
    <section className="rounded-2xl border border-[#e4e7ec] bg-white p-4 dark:border-white/10 dark:bg-[#182230] xl:col-span-2"><div className="flex flex-wrap items-center gap-3"><div className="min-w-56 flex-1"><h2 className="font-semibold">常用 API 预设</h2><p className="mt-1 text-sm text-[#667085]">只自动填写名称与地址，所有内容仍可编辑，也可以添加任意允许的兼容平台。</p></div><select aria-label="常用 API 预设" className={`${inputClass} mt-0 max-w-md`} value="" onChange={(event) => { const preset = AI_PROVIDER_PRESETS.find((item) => item.id === event.target.value); if (preset) setDraft({ ...blank, display_name: preset.name, base_url: preset.baseUrl }); }}><option value="">选择平台预设…</option>{AI_PROVIDER_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.kind} · {preset.name}</option>)}</select></div></section>
    <section className="rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><div className="flex items-center justify-between"><div><h2 className="font-semibold">服务连接</h2><p className="mt-1 text-sm text-[#667085]">密钥仅在服务端解密；平台默认项请在“模型与权限”选择具体模型。</p></div><button type="button" onClick={() => setDraft(blank)} className="rounded-xl border border-[#d0d5dd] px-3 py-2 text-sm font-semibold">新增</button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{providers.map((provider) => <button key={provider.id} type="button" onClick={() => setDraft({ ...provider, api_key: '' })} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${draft.id === provider.id ? 'border-[#155eef] bg-[#eff4ff] dark:bg-[#155eef]/10' : 'border-[#eaecf0] dark:border-white/10'}`}><div className="flex items-center justify-between gap-2"><strong>{provider.display_name}</strong><span className={`h-2.5 w-2.5 rounded-full ${provider.enabled && provider.has_api_key ? 'bg-[#17b26a]' : 'bg-[#98a2b3]'}`} /></div><p className="mt-2 truncate text-xs text-[#667085]">{provider.base_url}</p><p className="mt-1 truncate text-xs text-[#667085]">兼容备用：{provider.chat_model}</p></button>)}</div></section>
    <section className="h-fit rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><h2 className="font-semibold">{draft.id ? '编辑连接' : '新增连接'}</h2><div className="mt-4 space-y-4"><Field label="连接名称"><input className={inputClass} value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} placeholder="例如 OpenRouter" /></Field><Field label="API Base URL"><input className={inputClass} value={draft.base_url} onChange={(e) => setDraft({ ...draft, base_url: e.target.value })} placeholder="https://openrouter.ai/api/v1" /></Field><Field label="API Key"><input className={inputClass} type="password" placeholder={draft.has_api_key ? '已保存；留空不更换' : '首次保存必须填写'} value={draft.api_key ?? ''} onChange={(e) => setDraft({ ...draft, api_key: e.target.value })} /></Field><Field label="连接备用模型（兼容旧功能）"><input className={inputClass} value={draft.chat_model} onChange={(e) => setDraft({ ...draft, chat_model: e.target.value })} placeholder="读取模型后自动填写，也可手动输入" /></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />启用连接</label><button type="button" disabled={pending} onClick={onSave} className="h-11 w-full rounded-xl bg-[#155eef] text-sm font-semibold text-white disabled:opacity-50">{pending ? '保存中…' : '保存连接'}</button><button type="button" disabled={pending || (!draft.api_key?.trim() && !draft.has_api_key)} onClick={onDiscover} className="h-11 w-full rounded-xl border border-[#155eef] text-sm font-semibold text-[#155eef] disabled:opacity-50"><span className="material-icons-round mr-2 align-middle text-lg">sync</span>读取聚合平台全部模型</button><p className="text-xs leading-5 text-[#667085]">支持 OpenRouter 以及提供 OpenAI 兼容 <code>/models</code> 接口的平台。可以先读取模型，确认无误后再保存连接。</p></div></section>
    {discovered.length > 0 && <section className="xl:col-span-2 rounded-2xl border border-[#e4e7ec] bg-white p-5 dark:border-white/10 dark:bg-[#182230]"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold">上游模型选择</h2><p className="mt-1 text-sm text-[#667085]">共读取 {discovered.length} 个模型，已选择 {selected.length} 个。导入后自动成为全局可用模型。</p></div><input aria-label="搜索上游模型" className={`${inputClass} mt-0 max-w-sm`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或模型 ID" /></div><div className="mt-4 flex flex-wrap items-center gap-3"><label className="flex cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, ...visible.map((model) => model.modelId)])] : current.filter((id) => !visible.some((model) => model.modelId === id)))} />全选当前结果</label><span className="text-xs text-[#667085]">当前显示 {visible.length} 个</span><div className="ml-auto flex flex-wrap items-center gap-2"><span className="text-xs font-medium">同时授权套餐：</span>{PLAN_CODES.map((plan) => <label key={plan} className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold uppercase ${importPlans.includes(plan) ? 'border-[#155eef] bg-[#eff4ff] text-[#155eef]' : 'border-[#e4e7ec] dark:border-white/10'}`}><input type="checkbox" checked={importPlans.includes(plan)} onChange={(event) => setImportPlans((items) => event.target.checked ? [...items, plan] : items.filter((item) => item !== plan))} />{plan}</label>)}</div></div><div className="mt-4 grid max-h-[520px] gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">{visible.map((model) => <label key={model.modelId} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selected.includes(model.modelId) ? 'border-[#155eef] bg-[#eff4ff] dark:bg-[#155eef]/10' : 'border-[#eaecf0] dark:border-white/10'}`}><input className="mt-1" type="checkbox" checked={selected.includes(model.modelId)} onChange={(event) => setSelected((items) => event.target.checked ? [...items, model.modelId] : items.filter((id) => id !== model.modelId))} /><span className="min-w-0"><strong className="block truncate text-sm">{model.displayName}</strong><span className="mt-0.5 block truncate text-[11px] text-[#667085]">{model.modelId}</span><span className="mt-1 block text-[11px] text-[#667085]">{model.contextWindow ? `${model.contextWindow.toLocaleString()} context` : '未知上下文'}{model.supportsAgent ? ' · Agent' : ''}</span></span></label>)}</div>{!draft.id && <p className="mt-3 text-sm text-[#b54708]">模型已读取。请先保存连接，再执行批量导入。</p>}<button type="button" disabled={pending || selected.length === 0 || !draft.id} onClick={onImport} className="mt-4 h-11 w-full rounded-xl bg-[#101828] text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-[#101828]">{pending ? '导入中…' : `导入并启用 ${selected.length} 个模型`}</button></section>}
  </div>;
}

function UsageTab({ usage, rows }: { usage: AdminData['usage']; rows: AdminData['usageByProvider'] }) {
  return <div className="space-y-5"><section className="rounded-2xl border border-[#e4e7ec] bg-white p-6 dark:border-white/10 dark:bg-[#182230]"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[#155eef]">过去 30 天 · 总计</p><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Summary label="计费 Token" value={usage.billedTokens.toLocaleString()} /><Summary label="输入 Token" value={usage.inputTokens.toLocaleString()} /><Summary label="输出 Token" value={usage.outputTokens.toLocaleString()} /><Summary label="估算总费用" value={`¥${usage.estimatedCost.toFixed(4)}`} /></div></section><section className="overflow-hidden rounded-2xl border border-[#e4e7ec] bg-white dark:border-white/10 dark:bg-[#182230]"><div className="border-b border-[#eaecf0] p-5 dark:border-white/10"><h2 className="font-semibold">按 API 来源计费</h2><p className="mt-1 text-sm text-[#667085]">费用按实际请求使用的连接和模型单价估算；上游未提供价格时由 ADMIN 设置。</p></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#f9fafb] text-xs text-[#667085] dark:bg-white/5"><tr><th className="px-5 py-3">API 来源</th><th className="px-5 py-3">请求</th><th className="px-5 py-3">输入 Token</th><th className="px-5 py-3">输出 Token</th><th className="px-5 py-3 text-right">估算费用</th></tr></thead><tbody className="divide-y divide-[#eaecf0] dark:divide-white/10">{rows.length ? rows.map((row) => <tr key={row.providerId ?? 'legacy'}><td className="px-5 py-3 font-medium">{row.providerName}</td><td className="px-5 py-3">{row.requests.toLocaleString()}</td><td className="px-5 py-3">{row.inputTokens.toLocaleString()}</td><td className="px-5 py-3">{row.outputTokens.toLocaleString()}</td><td className="px-5 py-3 text-right font-semibold">¥{row.estimatedCost.toFixed(4)}</td></tr>) : <tr><td colSpan={5} className="px-5 py-8 text-center text-[#667085]">近 30 天暂无已完成的 API 请求。</td></tr>}</tbody></table></div></section></div>;
}
