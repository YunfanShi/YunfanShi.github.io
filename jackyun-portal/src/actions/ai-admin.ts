'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encryptSecret } from '@/lib/secret-crypto';
import { normalizeLlmBaseUrl } from '@/lib/llm-endpoint';

export type PlanCode = 'free' | 'plus' | 'pro' | 'ultra';
const PLAN_CODES: PlanCode[] = ['free', 'plus', 'pro', 'ultra'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface AdminAiProvider { id: string; display_name: string; base_url: string; chat_model: string; reasoning_model: string | null; site_model: string | null; input_cost_per_million: number; output_cost_per_million: number; enabled: boolean; is_default: boolean; has_api_key: boolean; }
export interface SubscriptionPlanAdmin { code: PlanCode; display_name: string; daily_token_limit: number; monthly_token_limit: number; max_output_tokens: number; monthly_site_generations: number; }
export interface AdminAiModel { id: number; provider_id: string; display_name: string; model_id: string; description: string; supports_chat: boolean; supports_agent: boolean; input_cost_per_million: number; output_cost_per_million: number; context_window: number; enabled: boolean; sort_order: number; }

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
  const [providerResult, planResult, modelResult, accessResult, usageResult] = await Promise.all([
    admin.from('ai_provider_configs').select('*').order('created_at'),
    admin.from('subscription_plans').select('*').order('monthly_token_limit'),
    admin.from('ai_model_catalog').select('*').order('sort_order').order('id'),
    admin.from('plan_ai_model_access').select('plan_code, model_id'),
    admin.rpc('admin_ai_usage_summary', { p_since: new Date(Date.now() - 30 * 86400000).toISOString() }).single(),
  ]);
  const error = providerResult.error || planResult.error || modelResult.error || accessResult.error || usageResult.error;
  if (error) throw new Error(error.message);
  const providers: AdminAiProvider[] = (providerResult.data ?? []).map((row) => ({ id: row.id, display_name: row.display_name, base_url: row.base_url, chat_model: row.chat_model, reasoning_model: row.reasoning_model, site_model: row.site_model, input_cost_per_million: Number(row.input_cost_per_million), output_cost_per_million: Number(row.output_cost_per_million), enabled: row.enabled, is_default: row.is_default, has_api_key: Boolean(row.encrypted_api_key) }));
  const usage = usageResult.data as { requests?: number; input_tokens?: number; output_tokens?: number; billed_tokens?: number; estimated_cost?: number } | null;
  return {
    providers,
    models: (modelResult.data ?? []).map((row) => ({ ...row, id: Number(row.id), input_cost_per_million: Number(row.input_cost_per_million), output_cost_per_million: Number(row.output_cost_per_million), context_window: Number(row.context_window), sort_order: Number(row.sort_order) })) as AdminAiModel[],
    modelAccess: (accessResult.data ?? []).reduce<Record<number, PlanCode[]>>((all, row) => {
      const modelId = Number(row.model_id);
      const planCode = row.plan_code as PlanCode;
      all[modelId] = [...(all[modelId] ?? []), planCode];
      return all;
    }, {}),
    plans: (planResult.data ?? []).map((row) => ({ ...row, daily_token_limit: Number(row.daily_token_limit), monthly_token_limit: Number(row.monthly_token_limit), max_output_tokens: Number(row.max_output_tokens), monthly_site_generations: Number(row.monthly_site_generations) })) as SubscriptionPlanAdmin[],
    usage: { requests: Number(usage?.requests ?? 0), inputTokens: Number(usage?.input_tokens ?? 0), outputTokens: Number(usage?.output_tokens ?? 0), billedTokens: Number(usage?.billed_tokens ?? 0), estimatedCost: Number(usage?.estimated_cost ?? 0) },
  };
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
      supports_chat: input.supports_chat,
      supports_agent: input.supports_agent,
      input_cost_per_million: Math.max(0, Number(input.input_cost_per_million) || 0),
      output_cost_per_million: Math.max(0, Number(input.output_cost_per_million) || 0),
      context_window: Math.max(0, Math.trunc(Number(input.context_window) || 0)),
      enabled: input.enabled,
      sort_order: Math.trunc(Number(input.sort_order) || 100),
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
