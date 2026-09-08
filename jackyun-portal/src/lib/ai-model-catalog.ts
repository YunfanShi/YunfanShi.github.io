import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

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

export async function getAvailableAiModels(userId: string | null): Promise<{ planCode: string; models: AiModelOption[] }> {
  const admin = createAdminClient();
  if (!admin || !userId) return { planCode: 'free', models: [] };

  const { data: entitlement } = await admin
    .from('user_entitlements')
    .select('plan_code, expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  const planCode = activePlanCode(entitlement as EntitlementRow | null);
  const { data: accessRows, error: accessError } = await admin
    .from('plan_ai_model_access')
    .select('model_id')
    .eq('plan_code', planCode);
  if (accessError || !accessRows?.length) return { planCode, models: [] };

  const ids = accessRows.map((row) => Number(row.model_id)).filter(Number.isSafeInteger);
  const { data: modelRows, error: modelError } = await admin
    .from('ai_model_catalog')
    .select('id, provider_id, display_name, model_id, description, supports_chat, supports_agent, input_cost_per_million, output_cost_per_million, context_window, sort_order')
    .eq('enabled', true)
    .in('id', ids)
    .order('sort_order')
    .order('id');
  if (modelError || !modelRows?.length) return { planCode, models: [] };

  const providerIds = [...new Set(modelRows.map((row) => row.provider_id))];
  const { data: providers } = await admin
    .from('ai_provider_configs')
    .select('id, display_name')
    .eq('enabled', true)
    .in('id', providerIds);
  const providerNames = new Map((providers ?? []).map((row) => [row.id, row.display_name]));

  return {
    planCode,
    models: modelRows
      .filter((row) => providerNames.has(row.provider_id))
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
      })),
  };
}

export async function resolveManagedAiModel(userId: string, catalogModelId: number, mode: AiWorkspaceMode) {
  const admin = createAdminClient();
  if (!admin || !Number.isSafeInteger(catalogModelId) || catalogModelId < 1) return null;

  const [{ data: entitlement }, { data: model }] = await Promise.all([
    admin.from('user_entitlements').select('plan_code, expires_at').eq('user_id', userId).maybeSingle(),
    admin.from('ai_model_catalog').select('*').eq('id', catalogModelId).eq('enabled', true).maybeSingle(),
  ]);
  if (!model || (mode === 'agent' ? !model.supports_agent : !model.supports_chat)) return null;

  const planCode = activePlanCode(entitlement as EntitlementRow | null);
  const [{ data: access }, { data: provider }] = await Promise.all([
    admin.from('plan_ai_model_access').select('model_id').eq('plan_code', planCode).eq('model_id', catalogModelId).maybeSingle(),
    admin.from('ai_provider_configs').select('*').eq('id', model.provider_id).eq('enabled', true).maybeSingle(),
  ]);
  if (!access || !provider?.encrypted_api_key) return null;
  return { model, provider, planCode };
}
