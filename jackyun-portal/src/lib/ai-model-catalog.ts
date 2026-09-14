import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeAiModelCapabilities, type AiModelCapability } from '@/lib/ai-model-capabilities';

export type AiWorkspaceMode = 'chat' | 'agent';

export interface AiModelOption {
  id: number;
  displayName: string;
  modelId: string;
  providerName: string;
  description: string;
  supportsChat: boolean;
  supportsAgent: boolean;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  contextWindow: number;
  capabilities: AiModelCapability[];
}

interface EntitlementRow {
  plan_code: string;
  expires_at: string | null;
}

function activePlanCode(entitlement: EntitlementRow | null): string {
  if (!entitlement) return 'free';
  if (entitlement.expires_at && Date.parse(entitlement.expires_at) <= Date.now()) return 'free';
  return entitlement.plan_code || 'free';
}

export async function getAvailableAiModels(userId: string | null): Promise<{ planCode: string; models: AiModelOption[]; smartSelectionEnabled: boolean }> {
  const admin = createAdminClient();
  if (!admin || !userId) return { planCode: 'free', models: [], smartSelectionEnabled: false };

  const [{ data: entitlement }, { data: settings }] = await Promise.all([
    admin.from('user_entitlements').select('plan_code, expires_at').eq('user_id', userId).maybeSingle(),
    admin.from('ai_platform_settings').select('smart_router_model_id').eq('singleton', true).maybeSingle(),
  ]);
  const planCode = activePlanCode(entitlement as EntitlementRow | null);
  const { data: accessRows, error: accessError } = await admin
    .from('plan_ai_model_access')
    .select('model_id')
    .eq('plan_code', planCode);
  if (accessError || !accessRows?.length) return { planCode, models: [], smartSelectionEnabled: false };

  const ids = accessRows.map((row) => Number(row.model_id)).filter(Number.isSafeInteger);
  const routerModelId = Number(settings?.smart_router_model_id);
  const requestedIds = Number.isSafeInteger(routerModelId) ? [...new Set([...ids, routerModelId])] : ids;
  const { data: modelRows, error: modelError } = await admin
    .from('ai_model_catalog')
    .select('id, provider_id, display_name, model_id, description, supports_chat, supports_agent, capabilities, input_cost_per_million, output_cost_per_million, context_window, sort_order')
    .eq('enabled', true)
    .in('id', requestedIds)
    .order('sort_order')
    .order('id');
  if (modelError || !modelRows?.length) return { planCode, models: [], smartSelectionEnabled: false };

  const providerIds = [...new Set(modelRows.map((row) => row.provider_id))];
  const { data: providers } = await admin
    .from('ai_provider_configs')
    .select('id, display_name, encrypted_api_key')
    .eq('enabled', true)
    .in('id', providerIds);
  const providerNames = new Map((providers ?? []).map((row) => [row.id, row.display_name]));
  const providerKeys = new Set((providers ?? []).filter((row) => row.encrypted_api_key).map((row) => row.id));
  const allowedIds = new Set(ids);
  const routerModel = modelRows.find((row) => Number(row.id) === routerModelId);

  return {
    planCode,
    models: modelRows
      .filter((row) => allowedIds.has(Number(row.id)) && providerNames.has(row.provider_id))
      .map((row) => ({
        id: Number(row.id),
        displayName: row.display_name,
        modelId: row.model_id,
        providerName: providerNames.get(row.provider_id) ?? 'Managed AI',
        description: row.description,
        supportsChat: row.supports_chat,
        supportsAgent: row.supports_agent,
        inputCostPerMillion: Number(row.input_cost_per_million),
        outputCostPerMillion: Number(row.output_cost_per_million),
        contextWindow: Number(row.context_window),
        capabilities: normalizeAiModelCapabilities(row.capabilities),
      })),
    smartSelectionEnabled: Boolean(routerModel?.supports_chat && providerKeys.has(routerModel.provider_id)),
  };
}

export async function resolveSmartAiRouting(userId: string, mode: AiWorkspaceMode, requiredCapabilities: AiModelCapability[] = []) {
  const admin = createAdminClient();
  if (!admin) return null;
  const [{ data: entitlement }, { data: settings }] = await Promise.all([
    admin.from('user_entitlements').select('plan_code, expires_at').eq('user_id', userId).maybeSingle(),
    admin.from('ai_platform_settings').select('smart_router_model_id').eq('singleton', true).maybeSingle(),
  ]);
  const routerModelId = Number(settings?.smart_router_model_id);
  if (!Number.isSafeInteger(routerModelId) || routerModelId < 1) return null;
  const planCode = activePlanCode(entitlement as EntitlementRow | null);
  const { data: accessRows, error: accessError } = await admin.from('plan_ai_model_access').select('model_id').eq('plan_code', planCode);
  if (accessError || !accessRows?.length) return null;
  const allowedIds = new Set(accessRows.map((row) => Number(row.model_id)).filter(Number.isSafeInteger));
  const requestedIds = [...new Set([...allowedIds, routerModelId])];
  const { data: models, error: modelError } = await admin.from('ai_model_catalog').select('*').eq('enabled', true).in('id', requestedIds).order('sort_order').order('id');
  if (modelError || !models?.length) return null;
  const providerIds = [...new Set(models.map((model) => model.provider_id))];
  const { data: providers, error: providerError } = await admin.from('ai_provider_configs').select('*').eq('enabled', true).in('id', providerIds);
  if (providerError || !providers?.length) return null;
  const providersById = new Map(providers.filter((provider) => provider.encrypted_api_key).map((provider) => [provider.id, provider]));
  const routerModel = models.find((model) => Number(model.id) === routerModelId && model.supports_chat);
  const routerProvider = routerModel ? providersById.get(routerModel.provider_id) : null;
  if (!routerModel || !routerProvider) return null;
  const candidates = models
    .filter((model) => allowedIds.has(Number(model.id))
      && (mode === 'agent' ? model.supports_agent : model.supports_chat)
      && requiredCapabilities.every((capability) => normalizeAiModelCapabilities(model.capabilities).includes(capability)))
    .map((model) => ({ model, provider: providersById.get(model.provider_id) }))
    .filter((candidate) => Boolean(candidate.provider));
  if (!candidates.length) return null;
  return { router: { model: routerModel, provider: routerProvider }, candidates, planCode };
}

export async function resolveManagedAiModel(userId: string, catalogModelId: number, mode: AiWorkspaceMode, requiredCapabilities: AiModelCapability[] = []) {
  const admin = createAdminClient();
  if (!admin || !Number.isSafeInteger(catalogModelId) || catalogModelId < 1) return null;

  const [{ data: entitlement }, { data: model }] = await Promise.all([
    admin.from('user_entitlements').select('plan_code, expires_at').eq('user_id', userId).maybeSingle(),
    admin.from('ai_model_catalog').select('*').eq('id', catalogModelId).eq('enabled', true).maybeSingle(),
  ]);
  if (!model
    || (mode === 'agent' ? !model.supports_agent : !model.supports_chat)
    || !requiredCapabilities.every((capability) => normalizeAiModelCapabilities(model.capabilities).includes(capability))) return null;

  const planCode = activePlanCode(entitlement as EntitlementRow | null);
  const [{ data: access }, { data: provider }] = await Promise.all([
    admin.from('plan_ai_model_access').select('model_id').eq('plan_code', planCode).eq('model_id', catalogModelId).maybeSingle(),
    admin.from('ai_provider_configs').select('*').eq('id', model.provider_id).eq('enabled', true).maybeSingle(),
  ]);
  if (!access || !provider?.encrypted_api_key) return null;
  return { model, provider, planCode };
}
