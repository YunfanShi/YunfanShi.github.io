-- Attribute managed AI usage and estimated cost to the API connection that
-- actually handled the request. Legacy rows remain visible as unattributed.
ALTER TABLE public.ai_usage_ledger
  ADD COLUMN provider_id uuid REFERENCES public.ai_provider_configs(id) ON DELETE SET NULL,
  ADD COLUMN catalog_model_id bigint REFERENCES public.ai_model_catalog(id) ON DELETE SET NULL;

CREATE INDEX ai_usage_provider_created_idx ON public.ai_usage_ledger(provider_id, created_at DESC);
CREATE INDEX ai_usage_catalog_model_idx ON public.ai_usage_ledger(catalog_model_id);

CREATE OR REPLACE FUNCTION public.admin_ai_usage_by_provider(p_since timestamptz)
RETURNS TABLE (
  provider_id uuid,
  provider_name text,
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
    l.provider_id,
    COALESCE(p.display_name, '未归因 / 旧记录'),
    count(*)::bigint,
    COALESCE(sum(l.input_tokens), 0),
    COALESCE(sum(l.output_tokens), 0),
    COALESCE(sum(l.billed_tokens), 0),
    COALESCE(sum(l.estimated_cost), 0)
  FROM public.ai_usage_ledger l
  LEFT JOIN public.ai_provider_configs p ON p.id = l.provider_id
  WHERE l.status = 'completed' AND l.created_at >= p_since
  GROUP BY l.provider_id, p.display_name
  ORDER BY COALESCE(sum(l.estimated_cost), 0) DESC, count(*) DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_ai_usage_by_provider(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ai_usage_by_provider(timestamptz) TO service_role;
