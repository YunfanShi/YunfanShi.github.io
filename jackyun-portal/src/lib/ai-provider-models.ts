export interface DiscoveredAiModel {
  modelId: string;
  displayName: string;
  description: string;
  contextWindow: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  supportsAgent: boolean;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function limitedText(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function pricePerMillion(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Number((parsed * 1_000_000).toFixed(4)) : 0;
}

/** Normalizes OpenAI-compatible and OpenRouter model-list responses. */
export function parseProviderModels(payload: unknown): DiscoveredAiModel[] {
  const root = record(payload);
  const rows = Array.isArray(root?.data) ? root.data : Array.isArray(payload) ? payload : [];
  const unique = new Map<string, DiscoveredAiModel>();

  for (const value of rows) {
    const row = record(value);
    const modelId = limitedText(row?.id, 160);
    if (!row || !modelId || unique.has(modelId)) continue;
    const pricing = record(row.pricing);
    const supportedParameters = Array.isArray(row.supported_parameters)
      ? row.supported_parameters.filter((item): item is string => typeof item === 'string')
      : null;
    unique.set(modelId, {
      modelId,
      displayName: limitedText(row.name, 80) || modelId.slice(0, 80),
      description: limitedText(row.description, 240),
      contextWindow: nonNegativeInteger(row.context_length ?? row.context_window),
      inputCostPerMillion: pricePerMillion(pricing?.prompt ?? row.input_cost_per_token),
      outputCostPerMillion: pricePerMillion(pricing?.completion ?? row.output_cost_per_token),
      supportsAgent: supportedParameters ? supportedParameters.includes('tools') : true,
    });
  }

  return [...unique.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}
