-- Persist the latest probe in full and retain lifetime health counters so
-- smart routing can prefer models that are both capable and currently healthy.
ALTER TABLE public.ai_model_catalog
  ADD COLUMN total_error_count bigint NOT NULL DEFAULT 0 CHECK (total_error_count >= 0),
  ADD COLUMN last_error_detail text,
  ADD COLUMN last_error_at timestamptz,
  ADD COLUMN test_run_count bigint NOT NULL DEFAULT 0 CHECK (test_run_count >= 0),
  ADD COLUMN test_attempt_count bigint NOT NULL DEFAULT 0 CHECK (test_attempt_count >= 0),
  ADD COLUMN last_test_at timestamptz,
  ADD COLUMN last_test_available boolean,
  ADD COLUMN last_test_attempt_count integer CHECK (last_test_attempt_count BETWEEN 1 AND 3),
  ADD COLUMN last_test_connection_ms integer CHECK (last_test_connection_ms >= 0),
  ADD COLUMN last_test_first_token_ms integer CHECK (last_test_first_token_ms >= 0),
  ADD COLUMN last_test_total_ms integer CHECK (last_test_total_ms >= 0),
  ADD COLUMN last_test_tokens_per_second numeric(12, 2) CHECK (last_test_tokens_per_second >= 0),
  ADD COLUMN last_test_log jsonb NOT NULL DEFAULT '[]'::jsonb;

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

  -- Every failed request is useful routing evidence, even when it should not
  -- trigger automatic unlisting (for example a timeout or a rate limit).
  UPDATE public.ai_model_catalog
  SET total_error_count = total_error_count + 1,
      last_error_detail = left(COALESCE(p_failure_detail, p_failure_kind, 'upstream failure'), 800),
      last_error_at = now(),
      updated_at = now()
  WHERE id = p_model_id;

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

CREATE OR REPLACE FUNCTION public.record_ai_model_test(
  p_model_id bigint,
  p_available boolean,
  p_attempt_count integer,
  p_connection_ms integer,
  p_first_token_ms integer,
  p_total_ms integer,
  p_tokens_per_second numeric,
  p_test_log jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.ai_model_catalog
  SET test_run_count = test_run_count + 1,
      test_attempt_count = test_attempt_count + p_attempt_count,
      last_test_at = now(),
      last_test_available = p_available,
      last_test_attempt_count = p_attempt_count,
      last_test_connection_ms = p_connection_ms,
      last_test_first_token_ms = p_first_token_ms,
      last_test_total_ms = p_total_ms,
      last_test_tokens_per_second = p_tokens_per_second,
      last_test_log = COALESCE(p_test_log, '[]'::jsonb),
      updated_at = now()
  WHERE id = p_model_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_model_test(bigint, boolean, integer, integer, integer, integer, numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_model_test(bigint, boolean, integer, integer, integer, integer, numeric, jsonb) TO service_role;
