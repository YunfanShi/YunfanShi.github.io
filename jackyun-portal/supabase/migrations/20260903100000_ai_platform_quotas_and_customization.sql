-- Managed AI providers, subscription quotas, usage ledger, UI backups and personal sites.

CREATE TABLE public.subscription_plans (
  code text PRIMARY KEY CHECK (code IN ('free', 'plus', 'pro', 'ultra')),
  display_name text NOT NULL,
  daily_token_limit bigint NOT NULL CHECK (daily_token_limit >= 0),
  monthly_token_limit bigint NOT NULL CHECK (monthly_token_limit >= 0),
  max_output_tokens integer NOT NULL CHECK (max_output_tokens BETWEEN 1 AND 100000),
  monthly_site_generations integer NOT NULL CHECK (monthly_site_generations >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.subscription_plans (code, display_name, daily_token_limit, monthly_token_limit, max_output_tokens, monthly_site_generations)
VALUES
  ('free', 'Free', 5000, 50000, 1000, 1),
  ('plus', 'Plus', 50000, 1000000, 4000, 3),
  ('pro', 'Pro', 200000, 5000000, 8000, 20),
  ('ultra', 'Ultra', 800000, 20000000, 16000, 100)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE public.user_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code text NOT NULL DEFAULT 'free' REFERENCES public.subscription_plans(code),
  bonus_tokens bigint NOT NULL DEFAULT 0 CHECK (bonus_tokens >= 0),
  expires_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  base_url text NOT NULL,
  encrypted_api_key text NOT NULL,
  chat_model text NOT NULL CHECK (char_length(chat_model) BETWEEN 1 AND 160),
  reasoning_model text,
  site_model text,
  input_cost_per_million numeric(12,4) NOT NULL DEFAULT 0 CHECK (input_cost_per_million >= 0),
  output_cost_per_million numeric(12,4) NOT NULL DEFAULT 0 CHECK (output_cost_per_million >= 0),
  enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_provider_one_default_idx ON public.ai_provider_configs ((is_default)) WHERE is_default;

CREATE TABLE public.ai_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature text NOT NULL CHECK (char_length(feature) BETWEEN 1 AND 64),
  model text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'failed')),
  reserved_tokens bigint NOT NULL CHECK (reserved_tokens >= 0),
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  billed_tokens bigint NOT NULL DEFAULT 0 CHECK (billed_tokens >= 0),
  estimated_cost numeric(14,6) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX ai_usage_user_created_idx ON public.ai_usage_ledger(user_id, created_at DESC);

CREATE TABLE public.ui_customization_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'user', 'restore')),
  before_config jsonb NOT NULL DEFAULT '{}',
  after_config jsonb NOT NULL DEFAULT '{}',
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ui_customization_user_created_idx ON public.ui_customization_backups(user_id, created_at DESC);

CREATE TABLE public.personal_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  schema_version integer NOT NULL DEFAULT 1,
  definition jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX personal_sites_user_updated_idx ON public.personal_sites(user_id, updated_at DESC);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ui_customization_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_sites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.subscription_plans, public.user_entitlements, public.ai_provider_configs, public.ai_usage_ledger, public.ui_customization_backups, public.personal_sites FROM anon, authenticated;
GRANT SELECT ON TABLE public.subscription_plans, public.user_entitlements, public.ai_usage_ledger, public.ui_customization_backups, public.personal_sites TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.personal_sites TO authenticated;
GRANT INSERT, DELETE ON TABLE public.ui_customization_backups TO authenticated;

CREATE POLICY "Authenticated users view plans" ON public.subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users view own entitlement" ON public.user_entitlements FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users view own AI usage" ON public.ai_usage_ledger FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users view own UI backups" ON public.ui_customization_backups FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id OR public.is_admin_user());
CREATE POLICY "Users create own UI backups" ON public.ui_customization_backups FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users delete own UI backups" ON public.ui_customization_backups FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users view own personal sites" ON public.personal_sites FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users create own personal sites" ON public.personal_sites FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users update own personal sites" ON public.personal_sites FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users delete own personal sites" ON public.personal_sites FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(p_user_id uuid, p_feature text, p_input_tokens bigint, p_requested_output integer, p_model text)
RETURNS TABLE (reservation_id uuid, allowed_output_tokens integer, plan_code text, daily_remaining bigint, monthly_remaining bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_plan public.subscription_plans%ROWTYPE;
  v_bonus bigint := 0;
  v_daily_used bigint;
  v_monthly_used bigint;
  v_allowed_output integer;
  v_reserved bigint;
  v_id uuid;
  v_site_generations bigint;
  v_recent_requests bigint;
  v_concurrent_requests bigint;
BEGIN
  IF p_input_tokens < 0 OR p_input_tokens > 50000 THEN RAISE EXCEPTION 'Invalid input token count'; END IF;
  SELECT p.* INTO v_plan FROM public.subscription_plans p
  LEFT JOIN public.user_entitlements e ON e.plan_code = p.code AND e.user_id = p_user_id AND (e.expires_at IS NULL OR e.expires_at > now())
  WHERE p.code = COALESCE(e.plan_code, 'free') LIMIT 1;
  IF NOT FOUND THEN SELECT * INTO v_plan FROM public.subscription_plans WHERE code = 'free'; END IF;
  SELECT COALESCE(e.bonus_tokens, 0) INTO v_bonus FROM public.user_entitlements e WHERE e.user_id = p_user_id AND (e.expires_at IS NULL OR e.expires_at > now());
  v_bonus := COALESCE(v_bonus, 0);
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));
  UPDATE public.ai_usage_ledger SET status = 'failed', billed_tokens = 0, settled_at = now() WHERE user_id = p_user_id AND status = 'reserved' AND created_at < now() - interval '5 minutes';
  SELECT count(*) INTO v_recent_requests FROM public.ai_usage_ledger WHERE user_id = p_user_id AND created_at >= now() - interval '1 minute';
  SELECT count(*) INTO v_concurrent_requests FROM public.ai_usage_ledger WHERE user_id = p_user_id AND status = 'reserved';
  IF v_recent_requests >= 30 THEN RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED'; END IF;
  IF v_concurrent_requests >= 3 THEN RAISE EXCEPTION 'CONCURRENT_LIMIT_EXCEEDED'; END IF;
  SELECT COALESCE(sum(CASE WHEN status = 'reserved' THEN reserved_tokens ELSE billed_tokens END), 0) INTO v_daily_used FROM public.ai_usage_ledger WHERE user_id = p_user_id AND created_at >= date_trunc('day', now());
  SELECT COALESCE(sum(CASE WHEN status = 'reserved' THEN reserved_tokens ELSE billed_tokens END), 0) INTO v_monthly_used FROM public.ai_usage_ledger WHERE user_id = p_user_id AND created_at >= date_trunc('month', now());
  v_allowed_output := LEAST(GREATEST(p_requested_output, 1), v_plan.max_output_tokens);
  v_reserved := p_input_tokens + (v_allowed_output * 2);
  IF p_feature = 'personal_site' THEN
    SELECT count(*) INTO v_site_generations FROM public.ai_usage_ledger WHERE user_id = p_user_id AND feature = 'personal_site' AND status IN ('reserved', 'completed') AND created_at >= date_trunc('month', now());
    IF v_site_generations >= v_plan.monthly_site_generations THEN RAISE EXCEPTION 'SITE_GENERATION_QUOTA_EXCEEDED'; END IF;
  END IF;
  IF v_daily_used + v_reserved > v_plan.daily_token_limit THEN RAISE EXCEPTION 'DAILY_QUOTA_EXCEEDED'; END IF;
  IF v_monthly_used + v_reserved > v_plan.monthly_token_limit + v_bonus THEN RAISE EXCEPTION 'MONTHLY_QUOTA_EXCEEDED'; END IF;
  INSERT INTO public.ai_usage_ledger(user_id, feature, model, reserved_tokens) VALUES (p_user_id, left(p_feature, 64), left(COALESCE(p_model, ''), 160), v_reserved) RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, v_allowed_output, v_plan.code, v_plan.daily_token_limit - v_daily_used - v_reserved, v_plan.monthly_token_limit + v_bonus - v_monthly_used - v_reserved;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_ai_usage(p_reservation_id uuid, p_input_tokens bigint, p_output_tokens bigint, p_success boolean, p_estimated_cost numeric DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.ai_usage_ledger SET
    status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    input_tokens = GREATEST(p_input_tokens, 0), output_tokens = GREATEST(p_output_tokens, 0),
    billed_tokens = CASE WHEN p_success THEN GREATEST(p_input_tokens, 0) + GREATEST(p_output_tokens, 0) * 2 ELSE 0 END,
    estimated_cost = CASE WHEN p_success THEN GREATEST(p_estimated_cost, 0) ELSE 0 END,
    settled_at = now()
  WHERE id = p_reservation_id AND status = 'reserved';
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage(uuid, text, bigint, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_ai_usage(uuid, bigint, bigint, boolean, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(uuid, text, bigint, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_ai_usage(uuid, bigint, bigint, boolean, numeric) TO service_role;
