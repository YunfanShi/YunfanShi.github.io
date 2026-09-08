-- Selectable AI model catalog and per-plan access control.
-- Provider credentials remain server-only in ai_provider_configs.

CREATE TABLE public.ai_model_catalog (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES public.ai_provider_configs(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  model_id text NOT NULL CHECK (char_length(model_id) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 240),
  supports_chat boolean NOT NULL DEFAULT true,
  supports_agent boolean NOT NULL DEFAULT false,
  input_cost_per_million numeric(12,4) NOT NULL DEFAULT 0 CHECK (input_cost_per_million >= 0),
  output_cost_per_million numeric(12,4) NOT NULL DEFAULT 0 CHECK (output_cost_per_million >= 0),
  context_window integer NOT NULL DEFAULT 0 CHECK (context_window >= 0),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, model_id)
);

CREATE INDEX ai_model_catalog_provider_idx ON public.ai_model_catalog(provider_id);
CREATE INDEX ai_model_catalog_enabled_sort_idx ON public.ai_model_catalog(enabled, sort_order, id);

CREATE TABLE public.plan_ai_model_access (
  plan_code text NOT NULL REFERENCES public.subscription_plans(code) ON DELETE CASCADE,
  model_id bigint NOT NULL REFERENCES public.ai_model_catalog(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_code, model_id)
);

CREATE INDEX plan_ai_model_access_model_idx ON public.plan_ai_model_access(model_id, plan_code);

ALTER TABLE public.ai_model_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_ai_model_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_model_catalog, public.plan_ai_model_access FROM anon, authenticated;

-- Preserve the currently configured managed models. Existing chat models remain
-- available to every plan; reasoning models begin at Plus and can be adjusted in Admin.
INSERT INTO public.ai_model_catalog (
  provider_id, display_name, model_id, description, supports_chat, supports_agent,
  input_cost_per_million, output_cost_per_million, sort_order
)
SELECT id, display_name, chat_model, '通用对话模型', true, false,
  input_cost_per_million, output_cost_per_million, 100
FROM public.ai_provider_configs
ON CONFLICT (provider_id, model_id) DO NOTHING;

INSERT INTO public.ai_model_catalog (
  provider_id, display_name, model_id, description, supports_chat, supports_agent,
  input_cost_per_million, output_cost_per_million, sort_order
)
SELECT id, display_name || ' Agent', reasoning_model, '适合复杂分析和多步骤任务', true, true,
  input_cost_per_million, output_cost_per_million, 200
FROM public.ai_provider_configs
WHERE reasoning_model IS NOT NULL AND reasoning_model <> chat_model
ON CONFLICT (provider_id, model_id) DO NOTHING;

INSERT INTO public.plan_ai_model_access(plan_code, model_id)
SELECT p.code, m.id
FROM public.subscription_plans p
CROSS JOIN public.ai_model_catalog m
WHERE m.supports_agent = false OR p.code IN ('plus', 'pro', 'ultra')
ON CONFLICT DO NOTHING;

-- Aggregate in Postgres instead of sending every ledger row to the Admin UI.
CREATE OR REPLACE FUNCTION public.admin_ai_usage_summary(p_since timestamptz)
RETURNS TABLE (
  requests bigint,
  input_tokens numeric,
  output_tokens numeric,
  billed_tokens numeric,
  estimated_cost numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    count(*)::bigint,
    COALESCE(sum(l.input_tokens), 0),
    COALESCE(sum(l.output_tokens), 0),
    COALESCE(sum(l.billed_tokens), 0),
    COALESCE(sum(l.estimated_cost), 0)
  FROM public.ai_usage_ledger l
  WHERE l.status = 'completed' AND l.created_at >= p_since;
$$;

REVOKE ALL ON FUNCTION public.admin_ai_usage_summary(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ai_usage_summary(timestamptz) TO service_role;
