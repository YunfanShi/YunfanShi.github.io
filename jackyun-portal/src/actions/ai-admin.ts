'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptSecret, encryptSecret } from '@/lib/secret-crypto';
import { normalizeLlmBaseUrl } from '@/lib/llm-endpoint';
import { parseProviderModels, type DiscoveredAiModel } from '@/lib/ai-provider-models';
import { normalizeAiModelCapabilities, type AiModelCapability } from '@/lib/ai-model-capabilities';
import { explainAiError } from '@/lib/ai-error';
import { extractCompletionText } from '@/lib/ai-smart-selection';
import { recordAiModelResult } from '@/lib/ai-model-health';

export type PlanCode = 'free' | 'plus' | 'pro' | 'ultra';
const PLAN_CODES: PlanCode[] = ['free', 'plus', 'pro', 'ultra'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface AdminAiProvider { id: string; display_name: string; base_url: string; chat_model: string; reasoning_model: string | null; site_model: string | null; input_cost_per_million: number; output_cost_per_million: number; enabled: boolean; is_default: boolean; has_api_key: boolean; }
export interface SubscriptionPlanAdmin { code: PlanCode; display_name: string; daily_token_limit: number; monthly_token_limit: number; max_output_tokens: number; monthly_site_generations: number; }
export interface AdminAiModel { id: number; provider_id: string; display_name: string; model_id: string; description: string; routing_description: string; capabilities: AiModelCapability[]; supports_chat: boolean; supports_agent: boolean; input_cost_per_million: number; output_cost_per_million: number; context_window: number; enabled: boolean; sort_order: number; consecutive_failures: number; last_failure_detail: string | null; last_failure_at: string | null; auto_disabled_at: string | null; auto_disabled_reason: string | null; }
export interface AdminAiProviderUsage { providerId: string | null; providerName: string; requests: number; inputTokens: number; outputTokens: number; billedTokens: number; estimatedCost: number; }
export interface AiModelTestResult { modelId: number; testedAt: string; available: boolean; httpStatus: number | null; connectionMs: number | null; firstTokenMs: number | null; totalMs: number; outputTokens: number; tokensPerSecond: number | null; responsePreview: string; error: string | null; }

async function adminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') throw new Error('Forbidden: Admin only');
  const admin = createAdminClient();
  if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY 未配置');
  return { admin, supabase, user };
}

export async function getAiAdminData() {
  const { admin } = await adminContext();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [providerResult, planResult, modelResult, accessResult, settingsResult, usageResult, providerUsageResult] = await Promise.all([
    admin.from('ai_provider_configs').select('*').order('created_at'),
    admin.from('subscription_plans').select('*').order('monthly_token_limit'),
    admin.from('ai_model_catalog').select('*').order('sort_order').order('id'),
    admin.from('plan_ai_model_access').select('plan_code, model_id'),
    admin.from('ai_platform_settings').select('smart_router_model_id, default_model_id, model_failure_threshold').eq('singleton', true).maybeSingle(),
    admin.rpc('admin_ai_usage_summary', { p_since: since }).single(),
    admin.rpc('admin_ai_usage_by_provider', { p_since: since }),
  ]);
  const error = providerResult.error || planResult.error || modelResult.error || accessResult.error || settingsResult.error || usageResult.error;
  if (error) throw new Error(error.message);
  const providers: AdminAiProvider[] = (providerResult.data ?? []).map((row) => ({ id: row.id, display_name: row.display_name, base_url: row.base_url, chat_model: row.chat_model, reasoning_model: row.reasoning_model, site_model: row.site_model, input_cost_per_million: Number(row.input_cost_per_million), output_cost_per_million: Number(row.output_cost_per_million), enabled: row.enabled, is_default: row.is_default, has_api_key: Boolean(row.encrypted_api_key) }));
  const usage = usageResult.data as { requests?: number; input_tokens?: number; output_tokens?: number; billed_tokens?: number; estimated_cost?: number } | null;
  const providerUsageRows = (providerUsageResult.data ?? []) as Array<{ provider_id: string | null; provider_name: string; requests: number | string; input_tokens: number | string; output_tokens: number | string; billed_tokens: number | string; estimated_cost: number | string }>;
  return {
    providers,
    models: (modelResult.data ?? []).map((row) => ({ ...row, id: Number(row.id), capabilities: normalizeAiModelCapabilities(row.capabilities), input_cost_per_million: Number(row.input_cost_per_million), output_cost_per_million: Number(row.output_cost_per_million), context_window: Number(row.context_window), sort_order: Number(row.sort_order), consecutive_failures: Number(row.consecutive_failures) })) as AdminAiModel[],
    modelAccess: (accessResult.data ?? []).reduce<Record<number, PlanCode[]>>((all, row) => {
      const modelId = Number(row.model_id);
      const planCode = row.plan_code as PlanCode;
      all[modelId] = [...(all[modelId] ?? []), planCode];
      return all;
    }, {}),
    smartRouterModelId: settingsResult.data?.smart_router_model_id ? Number(settingsResult.data.smart_router_model_id) : null,
    defaultModelId: settingsResult.data?.default_model_id ? Number(settingsResult.data.default_model_id) : null,
    modelFailureThreshold: Number(settingsResult.data?.model_failure_threshold ?? 3),
    plans: (planResult.data ?? []).map((row) => ({ ...row, daily_token_limit: Number(row.daily_token_limit), monthly_token_limit: Number(row.monthly_token_limit), max_output_tokens: Number(row.max_output_tokens), monthly_site_generations: Number(row.monthly_site_generations) })) as SubscriptionPlanAdmin[],
    usage: { requests: Number(usage?.requests ?? 0), inputTokens: Number(usage?.input_tokens ?? 0), outputTokens: Number(usage?.output_tokens ?? 0), billedTokens: Number(usage?.billed_tokens ?? 0), estimatedCost: Number(usage?.estimated_cost ?? 0) },
    usageByProvider: providerUsageRows.map((row): AdminAiProviderUsage => ({ providerId: row.provider_id, providerName: String(row.provider_name), requests: Number(row.requests), inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens), billedTokens: Number(row.billed_tokens), estimatedCost: Number(row.estimated_cost) })),
  };
}

export async function saveAiHealthSettings(threshold: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > 10) return { success: false, error: '自动下架阈值必须是 1–10 的整数。' };
    const { admin } = await adminContext();
    const { error } = await admin.from('ai_platform_settings').upsert({ singleton: true, model_failure_threshold: threshold, updated_at: new Date().toISOString() }, { onConflict: 'singleton' });
    if (error) return { success: false, error: error.message };
    revalidatePath('/admin/ai');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '保存自动下架规则失败。' }; }
}

export async function saveDefaultAiModel(modelId: number | null): Promise<{ success: boolean; error?: string }> {
  try {
    if (modelId !== null && (!Number.isSafeInteger(modelId) || modelId < 1)) return { success: false, error: '默认模型无效。' };
    const { admin } = await adminContext();
    if (modelId !== null) {
      const { data: model, error } = await admin.from('ai_model_catalog').select('provider_id, supports_chat, enabled').eq('id', modelId).maybeSingle();
      if (error) return { success: false, error: error.message };
      if (!model?.enabled || !model.supports_chat) return { success: false, error: '默认模型必须是已启用的聊天模型。' };
      const { data: provider } = await admin.from('ai_provider_configs').select('enabled, encrypted_api_key').eq('id', model.provider_id).maybeSingle();
      if (!provider?.enabled || !provider.encrypted_api_key) return { success: false, error: '模型连接未启用或缺少 API Key。' };
    }
    const { error } = await admin.from('ai_platform_settings').upsert({ singleton: true, default_model_id: modelId, updated_at: new Date().toISOString() }, { onConflict: 'singleton' });
    if (error) return { success: false, error: error.message };
    revalidatePath('/admin/ai'); revalidatePath('/ai');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '保存默认模型失败。' }; }
}

export async function testAiCatalogModel(modelId: number): Promise<AiModelTestResult> {
  const started = performance.now();
  const failed = (error: string, httpStatus: number | null = null, connectionMs: number | null = null): AiModelTestResult => ({ modelId, testedAt: new Date().toISOString(), available: false, httpStatus, connectionMs, firstTokenMs: null, totalMs: Math.round(performance.now() - started), outputTokens: 0, tokensPerSecond: null, responsePreview: '', error });
  try {
    if (!Number.isSafeInteger(modelId) || modelId < 1) return failed('模型 ID 无效。');
    const { admin } = await adminContext();
    const { data: model, error: modelError } = await admin.from('ai_model_catalog').select('id, provider_id, model_id').eq('id', modelId).maybeSingle();
    if (modelError || !model) return failed(modelError?.message ?? '模型不存在。');
    const { data: provider, error: providerError } = await admin.from('ai_provider_configs').select('base_url, encrypted_api_key, enabled').eq('id', model.provider_id).maybeSingle();
    if (providerError || !provider) return failed(providerError?.message ?? '模型连接不存在。');
    if (!provider.enabled) return failed('服务连接已停用。');
    let apiKey = '';
    try { apiKey = decryptSecret(provider.encrypted_api_key); } catch { return failed('API Key 无法解密。'); }
    const response = await fetch(`${provider.base_url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: model.model_id, messages: [{ role: 'user', content: 'Reply with the numbers 1 through 20, separated by single spaces, and nothing else.' }], temperature: 0, max_tokens: 64, stream: true }),
      signal: AbortSignal.timeout(45_000),
      cache: 'no-store',
    });
    const connectionMs = Math.round(performance.now() - started);
    if (!response.ok) {
      const rawError = (await response.text()).slice(0, 4000);
      await recordAiModelResult(admin, modelId, { success: false, status: response.status, detail: rawError });
      return failed(explainAiError(response.status, rawError).reason, response.status, connectionMs);
    }
    if (!response.body) return failed('上游返回成功状态，但没有响应内容。', response.status, connectionMs);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    let firstByteMs: number | null = null;
    let firstTokenMs: number | null = null;
    while (raw.length < 250_000) {
      const { done, value } = await reader.read();
      if (done) break;
      if (firstByteMs === null) firstByteMs = Math.round(performance.now() - started);
      raw += decoder.decode(value, { stream: true });
      if (firstTokenMs === null && /"content"\s*:\s*"(?!")/.test(raw)) firstTokenMs = Math.round(performance.now() - started);
    }
    if (raw.length >= 250_000) await reader.cancel('AI test response exceeded 250 KB');
    const totalMs = Math.round(performance.now() - started);
    let content = '';
    if (response.headers.get('content-type')?.includes('application/json')) {
      try { content = extractCompletionText(JSON.parse(raw)); } catch { /* handled as an empty response below */ }
    } else {
      for (const match of raw.matchAll(/"content"\s*:\s*"((?:\\.|[^"\\])*)"/g)) {
        try { content += JSON.parse(`"${match[1]}"`) as string; } catch { content += match[1]; }
      }
    }
    content = content.trim();
    if (!content) return { ...failed('已连接，但模型没有返回可读取的文本。', response.status, connectionMs), firstTokenMs: firstTokenMs ?? firstByteMs, totalMs };
    const usageOutput = Number([...raw.matchAll(/"(?:completion_tokens|output_tokens)"\s*:\s*(\d+)/g)].at(-1)?.[1]);
    const outputTokens = usageOutput || Math.max(1, Math.ceil(content.length / 4));
    const effectiveFirstToken = firstTokenMs ?? firstByteMs ?? connectionMs;
    const generationSeconds = Math.max(0.001, (totalMs - effectiveFirstToken) / 1000);
    await recordAiModelResult(admin, modelId, { success: true });
    return { modelId, testedAt: new Date().toISOString(), available: true, httpStatus: response.status, connectionMs, firstTokenMs: effectiveFirstToken, totalMs, outputTokens, tokensPerSecond: Math.round(outputTokens / generationSeconds * 10) / 10, responsePreview: content.slice(0, 300), error: null };
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError' ? '测试超过 45 秒，已超时。' : error instanceof Error ? error.message : '模型测试失败。';
    return failed(message);
  }
}

export async function saveSmartRouterModel(modelId: number | null): Promise<{ success: boolean; error?: string }> {
  try {
    if (modelId !== null && (!Number.isSafeInteger(modelId) || modelId < 1)) return { success: false, error: '智能选择模型无效。' };
    const { admin } = await adminContext();
    if (modelId !== null) {
      const { data: model, error: modelError } = await admin.from('ai_model_catalog').select('provider_id, supports_chat, enabled').eq('id', modelId).maybeSingle();
      if (modelError) return { success: false, error: modelError.message };
      if (!model?.enabled || !model.supports_chat) return { success: false, error: '智能选择模型必须是已启用的聊天模型。' };
      const { data: provider, error: providerError } = await admin.from('ai_provider_configs').select('enabled, encrypted_api_key').eq('id', model.provider_id).maybeSingle();
      if (providerError) return { success: false, error: providerError.message };
      if (!provider?.enabled || !provider.encrypted_api_key) return { success: false, error: '该模型的服务连接未启用或缺少 API Key。' };
    }
    const { error } = await admin.from('ai_platform_settings').upsert({ singleton: true, smart_router_model_id: modelId, updated_at: new Date().toISOString() }, { onConflict: 'singleton' });
    if (error) return { success: false, error: error.message };
    revalidatePath('/admin/ai'); revalidatePath('/ai');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '保存智能选择模型失败。' }; }
}

export async function saveAiProvider(input: Omit<AdminAiProvider, 'has_api_key'> & { api_key?: string }): Promise<{ success: boolean; provider?: AdminAiProvider; error?: string }> {
  try {
    const { admin, user } = await adminContext();
    const baseUrl = normalizeLlmBaseUrl(input.base_url);
    if (!baseUrl) return { success: false, error: '服务地址无效或不在允许列表中。' };
    if (!input.display_name.trim() || !input.chat_model.trim()) return { success: false, error: '名称和普通模型不能为空。' };
    const existing = input.id ? await admin.from('ai_provider_configs').select('encrypted_api_key').eq('id', input.id).maybeSingle() : { data: null, error: null };
    if (existing.error) return { success: false, error: existing.error.message };
    const encryptedKey = input.api_key?.trim() ? encryptSecret(input.api_key.trim()) : existing.data?.encrypted_api_key;
    if (!encryptedKey) return { success: false, error: '首次保存必须输入 API Key。' };
    if (input.is_default) await admin.from('ai_provider_configs').update({ is_default: false }).neq('id', input.id || '00000000-0000-0000-0000-000000000000');
    const payload = { display_name: input.display_name.trim(), base_url: baseUrl, encrypted_api_key: encryptedKey, chat_model: input.chat_model.trim().slice(0, 160), reasoning_model: input.reasoning_model?.trim().slice(0, 160) || null, site_model: input.site_model?.trim().slice(0, 160) || null, input_cost_per_million: Math.max(0, Number(input.input_cost_per_million) || 0), output_cost_per_million: Math.max(0, Number(input.output_cost_per_million) || 0), enabled: input.enabled, is_default: input.is_default, created_by: user.id, updated_at: new Date().toISOString() };
    const result = input.id
      ? await admin.from('ai_provider_configs').update(payload).eq('id', input.id).select('*').single()
      : await admin.from('ai_provider_configs').insert(payload).select('*').single();
    const { error } = result;
    if (error) return { success: false, error: error.message };
    const row = result.data;
    revalidatePath('/admin/ai');
    return { success: true, provider: { id: row.id, display_name: row.display_name, base_url: row.base_url, chat_model: row.chat_model, reasoning_model: row.reasoning_model, site_model: row.site_model, input_cost_per_million: Number(row.input_cost_per_million), output_cost_per_million: Number(row.output_cost_per_million), enabled: row.enabled, is_default: row.is_default, has_api_key: Boolean(row.encrypted_api_key) } };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '保存失败' }; }
}

export async function saveAiModel(input: AdminAiModel, plans: PlanCode[]): Promise<{ success: boolean; model?: AdminAiModel; error?: string }> {
  try {
    const { admin } = await adminContext();
    if (!UUID_PATTERN.test(input.provider_id) || !input.display_name.trim() || !input.model_id.trim()) return { success: false, error: '请选择服务并填写模型名称与 ID。' };
    if (!input.supports_chat && !input.supports_agent) return { success: false, error: '模型至少需要支持聊天或 Agent。' };
    if (plans.some((plan) => !PLAN_CODES.includes(plan))) return { success: false, error: '套餐授权无效。' };
    const payload = {
      provider_id: input.provider_id,
      display_name: input.display_name.trim().slice(0, 80),
      model_id: input.model_id.trim().slice(0, 160),
      description: input.description.trim().slice(0, 240),
      routing_description: input.routing_description.trim().slice(0, 2000),
      capabilities: normalizeAiModelCapabilities(input.capabilities),
      supports_chat: input.supports_chat,
      supports_agent: input.supports_agent,
      input_cost_per_million: Math.max(0, Number(input.input_cost_per_million) || 0),
      output_cost_per_million: Math.max(0, Number(input.output_cost_per_million) || 0),
      context_window: Math.max(0, Math.trunc(Number(input.context_window) || 0)),
      enabled: input.enabled,
      sort_order: Math.trunc(Number(input.sort_order) || 100),
      ...(input.enabled ? { consecutive_failures: 0, last_failure_kind: null, last_failure_detail: null, last_failure_at: null, auto_disabled_at: null, auto_disabled_reason: null } : {}),
      updated_at: new Date().toISOString(),
    };
    const result = input.id
      ? await admin.from('ai_model_catalog').update(payload).eq('id', input.id).select('*').single()
      : await admin.from('ai_model_catalog').insert(payload).select('*').single();
    if (result.error || !result.data) return { success: false, error: result.error?.message ?? '模型保存失败。' };
    const modelId = Number(result.data.id);
    if (plans.length) {
      const { error: accessError } = await admin.from('plan_ai_model_access').upsert(plans.map((plan_code) => ({ plan_code, model_id: modelId })), { onConflict: 'plan_code,model_id' });
      if (accessError) return { success: false, error: accessError.message };
    }
    const stalePlans = PLAN_CODES.filter((planCode) => !plans.includes(planCode));
    if (stalePlans.length) {
      const { error: deleteError } = await admin.from('plan_ai_model_access').delete().eq('model_id', modelId).in('plan_code', stalePlans);
      if (deleteError) return { success: false, error: deleteError.message };
    }
    revalidatePath('/admin/ai'); revalidatePath('/ai');
    return { success: true, model: { ...input, ...payload, id: modelId } };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '模型保存失败' }; }
}

export async function discoverAiProviderModels(input: { providerId?: string; baseUrl: string; apiKey?: string }): Promise<{ success: boolean; models?: DiscoveredAiModel[]; error?: string }> {
  try {
    const { admin } = await adminContext();
    const saved = input.providerId && UUID_PATTERN.test(input.providerId)
      ? await admin.from('ai_provider_configs').select('base_url, encrypted_api_key').eq('id', input.providerId).maybeSingle()
      : { data: null, error: null };
    if (saved.error) return { success: false, error: saved.error.message };
    const baseUrl = normalizeLlmBaseUrl(input.baseUrl || saved.data?.base_url || '');
    if (!baseUrl) return { success: false, error: '服务地址无效或不在允许列表中。' };
    let apiKey = input.apiKey?.trim() ?? '';
    if (!apiKey && saved.data?.encrypted_api_key) {
      try { apiKey = decryptSecret(saved.data.encrypted_api_key); } catch { return { success: false, error: 'API Key 无法解密，请重新保存连接。' }; }
    }
    if (!apiKey) return { success: false, error: '请输入 API Key，或选择一个已保存密钥的连接。' };
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { success: false, error: `读取模型失败（HTTP ${response.status}）。请检查地址、密钥和模型读取权限。` };
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > 5_000_000) return { success: false, error: '模型列表过大，已停止读取。' };
    const text = await response.text();
    if (text.length > 5_000_000) return { success: false, error: '模型列表过大，已停止读取。' };
    const models = parseProviderModels(JSON.parse(text));
    return models.length ? { success: true, models } : { success: false, error: '上游没有返回兼容的文本模型。' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '读取模型失败。' };
  }
}

export async function importAiProviderModels(providerId: string, inputs: DiscoveredAiModel[], plans: PlanCode[]): Promise<{ success: boolean; models?: AdminAiModel[]; error?: string }> {
  try {
    if (!UUID_PATTERN.test(providerId) || !inputs.length || inputs.length > 1000) return { success: false, error: '请选择 1–1000 个模型。' };
    if (plans.some((plan) => !PLAN_CODES.includes(plan))) return { success: false, error: '套餐授权无效。' };
    const { admin } = await adminContext();
    const normalized = parseProviderModels({ data: inputs.map((input) => ({
      id: input.modelId,
      name: input.displayName,
      description: input.description,
      context_length: input.contextWindow,
      pricing: { prompt: Number(input.inputCostPerMillion) / 1_000_000, completion: Number(input.outputCostPerMillion) / 1_000_000 },
      supported_parameters: input.supportsAgent ? ['tools'] : [],
    })) });
    if (normalized.length !== inputs.length) return { success: false, error: '模型列表包含重复或无效项目。' };
    const { data, error } = await admin.from('ai_model_catalog').upsert(normalized.map((model, index) => ({
      provider_id: providerId,
      display_name: model.displayName,
      model_id: model.modelId,
      description: model.description,
      routing_description: model.description,
      capabilities: model.capabilities,
      supports_chat: true,
      supports_agent: model.supportsAgent,
      input_cost_per_million: model.inputCostPerMillion,
      output_cost_per_million: model.outputCostPerMillion,
      context_window: model.contextWindow,
      enabled: true,
      sort_order: 100 + index,
      updated_at: new Date().toISOString(),
    })), { onConflict: 'provider_id,model_id' }).select('*');
    if (error || !data) return { success: false, error: error?.message ?? '导入模型失败。' };
    const ids = data.map((row) => Number(row.id));
    if (plans.length) {
      const { error: accessError } = await admin.from('plan_ai_model_access').upsert(ids.flatMap((model_id) => plans.map((plan_code) => ({ plan_code, model_id }))), { onConflict: 'plan_code,model_id' });
      if (accessError) return { success: false, error: accessError.message };
    }
    revalidatePath('/admin/ai'); revalidatePath('/ai');
    return { success: true, models: data.map((row) => ({ ...row, id: Number(row.id), capabilities: normalizeAiModelCapabilities(row.capabilities), input_cost_per_million: Number(row.input_cost_per_million), output_cost_per_million: Number(row.output_cost_per_million), context_window: Number(row.context_window), sort_order: Number(row.sort_order), consecutive_failures: Number(row.consecutive_failures) })) as AdminAiModel[] };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '导入模型失败。' }; }
}

export async function saveEnabledAiModels(modelIds: number[]): Promise<{ success: boolean; error?: string }> {
  try {
    if (modelIds.some((id) => !Number.isSafeInteger(id) || id < 1)) return { success: false, error: '模型选择无效。' };
    const { admin } = await adminContext();
    const { data, error } = await admin.from('ai_model_catalog').select('*').order('id');
    if (error) return { success: false, error: error.message };
    const selected = new Set(modelIds);
    if (selected.size !== modelIds.length || modelIds.some((id) => !(data ?? []).some((row) => Number(row.id) === id))) return { success: false, error: '模型选择包含不存在的项目。' };
    const enabledIds = (data ?? []).map((row) => Number(row.id)).filter((id) => selected.has(id));
    const disabledIds = (data ?? []).map((row) => Number(row.id)).filter((id) => !selected.has(id));
    if (enabledIds.length) {
      const { error: enableError } = await admin.from('ai_model_catalog').update({ enabled: true, consecutive_failures: 0, last_failure_kind: null, last_failure_detail: null, last_failure_at: null, auto_disabled_at: null, auto_disabled_reason: null, updated_at: new Date().toISOString() }).in('id', enabledIds);
      if (enableError) return { success: false, error: enableError.message };
    }
    if (disabledIds.length) {
      const { error: disableError } = await admin.from('ai_model_catalog').update({ enabled: false, updated_at: new Date().toISOString() }).in('id', disabledIds);
      if (disableError) return { success: false, error: disableError.message };
    }
    revalidatePath('/admin/ai'); revalidatePath('/ai');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '保存可用模型失败。' }; }
}

export async function setAiModelEnabled(modelId: number, enabled: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    if (!Number.isSafeInteger(modelId) || modelId < 1) return { success: false, error: '模型无效。' };
    const { admin } = await adminContext();
    const payload = enabled
      ? { enabled: true, consecutive_failures: 0, last_failure_kind: null, last_failure_detail: null, last_failure_at: null, auto_disabled_at: null, auto_disabled_reason: null, updated_at: new Date().toISOString() }
      : { enabled: false, updated_at: new Date().toISOString() };
    const { data, error } = await admin.from('ai_model_catalog').update(payload).eq('id', modelId).select('id').maybeSingle();
    if (error || !data) return { success: false, error: error?.message ?? '模型不存在。' };
    revalidatePath('/admin/ai'); revalidatePath('/ai');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '更新模型状态失败。' }; }
}

export async function deleteAiModel(modelId: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (!Number.isSafeInteger(modelId) || modelId < 1) return { success: false, error: '模型无效。' };
    const { admin } = await adminContext();
    const { data, error } = await admin.from('ai_model_catalog').delete().eq('id', modelId).select('id').maybeSingle();
    if (error || !data) return { success: false, error: error?.message ?? '模型不存在或已删除。' };
    revalidatePath('/admin/ai'); revalidatePath('/ai');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '删除模型失败。' }; }
}

export async function savePlanAiModelAccess(planCode: PlanCode, modelIds: number[]): Promise<{ success: boolean; error?: string }> {
  try {
    if (!PLAN_CODES.includes(planCode) || modelIds.some((id) => !Number.isSafeInteger(id) || id < 1)) return { success: false, error: '套餐或模型选择无效。' };
    const { admin } = await adminContext();
    const { data: models, error: modelError } = await admin.from('ai_model_catalog').select('id').eq('enabled', true);
    if (modelError) return { success: false, error: modelError.message };
    const available = new Set((models ?? []).map((row) => Number(row.id)));
    if (new Set(modelIds).size !== modelIds.length || modelIds.some((id) => !available.has(id))) return { success: false, error: '套餐只能选择全局已启用模型。' };
    const { error: deleteError } = await admin.from('plan_ai_model_access').delete().eq('plan_code', planCode);
    if (deleteError) return { success: false, error: deleteError.message };
    if (modelIds.length) {
      const { error: insertError } = await admin.from('plan_ai_model_access').insert(modelIds.map((model_id) => ({ plan_code: planCode, model_id })));
      if (insertError) return { success: false, error: insertError.message };
    }
    revalidatePath('/admin/ai'); revalidatePath('/ai');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '保存套餐模型失败。' }; }
}

export async function saveSubscriptionPlan(plan: SubscriptionPlanAdmin): Promise<{ success: boolean; error?: string }> {
  try {
    const { admin } = await adminContext();
    const values = [plan.daily_token_limit, plan.monthly_token_limit, plan.max_output_tokens, plan.monthly_site_generations].map(Number);
    if (!PLAN_CODES.includes(plan.code) || values.some((value) => !Number.isSafeInteger(value) || value < 0) || plan.max_output_tokens < 1 || plan.max_output_tokens > 100000) return { success: false, error: '额度必须是有效范围内的整数。' };
    const { error } = await admin.from('subscription_plans').update({ daily_token_limit: plan.daily_token_limit, monthly_token_limit: plan.monthly_token_limit, max_output_tokens: plan.max_output_tokens, monthly_site_generations: plan.monthly_site_generations, updated_at: new Date().toISOString() }).eq('code', plan.code);
    if (error) return { success: false, error: error.message };
    revalidatePath('/admin/ai'); return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '保存失败' }; }
}

export async function setUserPlan(userId: string, planCode: PlanCode): Promise<{ success: boolean; error?: string }> {
  try {
    if (!UUID_PATTERN.test(userId) || !PLAN_CODES.includes(planCode)) return { success: false, error: '用户或套餐无效。' };
    const { admin, user } = await adminContext();
    const { error } = await admin.from('user_entitlements').upsert({ user_id: userId, plan_code: planCode, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) return { success: false, error: error.message };
    const { error: noticeError } = await admin.from('site_notifications').insert({
      title: 'AI 套餐已更新',
      content: `管理员已将你的平台 AI 套餐调整为 **${planCode.toUpperCase()}**。新额度立即生效。`,
      content_type: 'markdown', delivery_type: 'message', recipient_user_id: userId, created_by: user.id,
    });
    if (noticeError) return { success: false, error: `套餐已更新，但通知发送失败：${noticeError.message}` };
    revalidatePath('/admin/users'); return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '更新套餐失败' }; }
}

export async function resetUserAiQuota(userId: string, scope: 'daily' | 'monthly'): Promise<{ success: boolean; error?: string }> {
  try {
    if (!UUID_PATTERN.test(userId) || !['daily', 'monthly'].includes(scope)) return { success: false, error: '用户或重置范围无效。' };
    const { supabase } = await adminContext();
    const { error } = await supabase.rpc('admin_reset_ai_quota', { p_user_id: userId, p_scope: scope });
    if (error) return { success: false, error: error.message };
    revalidatePath('/admin/users');
    revalidatePath('/settings');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '额度重置失败' }; }
}

export async function getUserPlans(): Promise<Record<string, PlanCode>> {
  const { admin } = await adminContext();
  const { data, error } = await admin.from('user_entitlements').select('user_id, plan_code');
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((row) => [row.user_id, row.plan_code as PlanCode]));
}
