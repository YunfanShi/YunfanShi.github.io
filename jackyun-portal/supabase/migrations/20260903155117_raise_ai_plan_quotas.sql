-- Raise existing installations to practical managed-AI quotas.
UPDATE public.subscription_plans AS plan
SET daily_token_limit = quota.daily_limit,
    monthly_token_limit = quota.monthly_limit,
    max_output_tokens = quota.max_output,
    monthly_site_generations = quota.site_generations,
    updated_at = now()
FROM (VALUES
  ('free'::text, 20000::bigint, 300000::bigint, 8000, 5),
  ('plus', 100000, 2000000, 16000, 30),
  ('pro', 500000, 10000000, 32000, 100),
  ('ultra', 2000000, 50000000, 64000, 500)
) AS quota(code, daily_limit, monthly_limit, max_output, site_generations)
WHERE plan.code = quota.code;
