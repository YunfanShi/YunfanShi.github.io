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

async function adminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') throw new Error('Forbidden: Admin only');
  const admin = createAdminClient();
  if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY 未配置');
  return { admin, user };
}

export async function getAiAdminData() {
  const { admin } = await adminContext();
  const [providerResult, planResult, usageResult, backupResult] = await Promise.all([
    admin.from('ai_provider_configs').select('*').order('created_at'),
    admin.from('subscription_plans').select('*').order('monthly_token_limit'),
    admin.from('ai_usage_ledger').select('input_tokens, output_tokens, billed_tokens, estimated_cost, status').gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    admin.from('ui_customization_backups').select('id, user_id, summary, source, before_config, after_config, created_at').order('created_at', { ascending: false }).limit(50),
  ]);
  const error = providerResult.error || planResult.error || usageResult.error || backupResult.error;
  if (error) throw new Error(error.message);
  const providers: AdminAiProvider[] = (providerResult.data ?? []).map((row) => ({ id: row.id, display_name: row.display_name, base_url: row.base_url, chat_model: row.chat_model, reasoning_model: row.reasoning_model, site_model: row.site_model, input_cost_per_million: Number(row.input_cost_per_million), output_cost_per_million: Number(row.output_cost_per_million), enabled: row.enabled, is_default: row.is_default, has_api_key: Boolean(row.encrypted_api_key) }));
  const completed = (usageResult.data ?? []).filter((row) => row.status === 'completed');
  return {
    providers,
    plans: (planResult.data ?? []).map((row) => ({ ...row, daily_token_limit: Number(row.daily_token_limit), monthly_token_limit: Number(row.monthly_token_limit), max_output_tokens: Number(row.max_output_tokens), monthly_site_generations: Number(row.monthly_site_generations) })) as SubscriptionPlanAdmin[],
    usage: { requests: completed.length, inputTokens: completed.reduce((n, r) => n + Number(r.input_tokens), 0), outputTokens: completed.reduce((n, r) => n + Number(r.output_tokens), 0), billedTokens: completed.reduce((n, r) => n + Number(r.billed_tokens), 0), estimatedCost: completed.reduce((n, r) => n + Number(r.estimated_cost), 0) },
    backups: backupResult.data ?? [],
  };
}

export async function saveAiProvider(input: Omit<AdminAiProvider, 'has_api_key'> & { api_key?: string }): Promise<{ success: boolean; error?: string }> {
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
    const { error } = input.id ? await admin.from('ai_provider_configs').update(payload).eq('id', input.id) : await admin.from('ai_provider_configs').insert(payload);
    if (error) return { success: false, error: error.message };
    revalidatePath('/admin/ai'); return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '保存失败' }; }
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
    revalidatePath('/admin/users'); return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : '更新套餐失败' }; }
}

export async function getUserPlans(): Promise<Record<string, PlanCode>> {
  const { admin } = await adminContext();
  const { data, error } = await admin.from('user_entitlements').select('user_id, plan_code');
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((row) => [row.user_id, row.plan_code as PlanCode]));
}
