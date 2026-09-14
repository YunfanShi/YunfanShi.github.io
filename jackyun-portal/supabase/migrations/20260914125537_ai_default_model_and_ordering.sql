-- Administrators choose a concrete default model. Provider defaults remain as
-- a backward-compatible fallback until this setting is populated.
ALTER TABLE public.ai_platform_settings
  ADD COLUMN default_model_id bigint REFERENCES public.ai_model_catalog(id) ON DELETE SET NULL;

UPDATE public.ai_platform_settings settings
SET default_model_id = candidate.id
FROM LATERAL (
  SELECT model.id
  FROM public.ai_provider_configs provider
  JOIN public.ai_model_catalog model
    ON model.provider_id = provider.id AND model.model_id = provider.chat_model
  WHERE provider.is_default AND provider.enabled AND model.enabled AND model.supports_chat
  ORDER BY model.sort_order, model.id
  LIMIT 1
) candidate
WHERE settings.singleton AND settings.default_model_id IS NULL;

CREATE OR REPLACE FUNCTION public.record_ai_model_result(
  p_model_id bigint,
  p_success boolean,
  p_failure_kind text DEFAULT NULL,
  p_failure_detail text DEFAULT NULL
)
RETURNS TABLE (
  newly_disabled boolean,
  model_name text,
  failure_count integer,
  is_primary boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_model public.ai_model_catalog%ROWTYPE;
  v_threshold integer := 3;
  v_count integer;
  v_primary boolean := false;
  v_eligible boolean;
BEGIN
  SELECT * INTO v_model FROM public.ai_model_catalog WHERE id = p_model_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT model_failure_threshold, default_model_id = p_model_id
  INTO v_threshold, v_primary
  FROM public.ai_platform_settings WHERE singleton = true;
  v_threshold := COALESCE(v_threshold, 3);
  v_primary := COALESCE(v_primary, false);

  IF p_success THEN
    UPDATE public.ai_model_catalog
    SET consecutive_failures = 0, last_failure_kind = NULL,
        last_failure_detail = NULL, last_failure_at = NULL
    WHERE id = p_model_id AND consecutive_failures > 0;
    RETURN QUERY SELECT false, v_model.display_name, 0, v_primary;
    RETURN;
  END IF;

  v_eligible := p_failure_kind = ANY (ARRAY['billing', 'authentication', 'permission', 'model_unavailable']);
  IF NOT v_eligible OR NOT v_model.enabled THEN
    RETURN QUERY SELECT false, v_model.display_name, v_model.consecutive_failures, v_primary;
    RETURN;
  END IF;

  v_count := v_model.consecutive_failures + 1;
  UPDATE public.ai_model_catalog
  SET consecutive_failures = v_count,
      last_failure_kind = left(COALESCE(p_failure_kind, ''), 64),
      last_failure_detail = left(COALESCE(p_failure_detail, ''), 800),
      last_failure_at = now(),
      enabled = CASE WHEN v_count >= v_threshold THEN false ELSE enabled END,
      auto_disabled_at = CASE WHEN v_count >= v_threshold THEN now() ELSE auto_disabled_at END,
      auto_disabled_reason = CASE WHEN v_count >= v_threshold THEN left(COALESCE(p_failure_detail, p_failure_kind, 'upstream failure'), 800) ELSE auto_disabled_reason END,
      updated_at = now()
  WHERE id = p_model_id;

  RETURN QUERY SELECT v_count >= v_threshold, v_model.display_name, v_count, v_primary;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_model_result(bigint, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_model_result(bigint, boolean, text, text) TO service_role;
