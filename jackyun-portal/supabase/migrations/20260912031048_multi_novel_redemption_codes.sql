-- Allow one novel redemption code to grant an ordered bundle of catalog books.

ALTER TABLE public.user_novel_entitlements
  ADD COLUMN reader_added_at timestamptz;

CREATE TABLE public.redemption_code_novels (
  code_id uuid NOT NULL REFERENCES public.redemption_codes(id) ON DELETE CASCADE,
  novel_id uuid NOT NULL REFERENCES public.novel_catalog(id) ON DELETE CASCADE,
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 49),
  PRIMARY KEY (code_id, novel_id),
  UNIQUE (code_id, sort_order)
);

CREATE INDEX redemption_code_novels_novel_idx
  ON public.redemption_code_novels(novel_id);

INSERT INTO public.redemption_code_novels(code_id, novel_id, sort_order)
SELECT id, novel_id, 0
FROM public.redemption_codes
WHERE reward_type = 'novel' AND novel_id IS NOT NULL
ON CONFLICT (code_id, novel_id) DO NOTHING;

ALTER TABLE public.redemption_code_novels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.redemption_code_novels FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.redemption_code_novels TO service_role;

CREATE OR REPLACE FUNCTION public.redeem_reward_code(p_user_id uuid, p_code_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code public.redemption_codes%ROWTYPE;
  v_existing public.user_entitlements%ROWTYPE;
  v_snapshot jsonb;
  v_novels jsonb;
  v_available_novel_count integer;
  v_bundle_novel_count integer;
  v_new_expiry timestamptz;
  v_plan_rank integer;
  v_existing_rank integer;
BEGIN
  IF p_user_id IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_CODE';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_code_hash));
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));
  SELECT * INTO v_code FROM public.redemption_codes WHERE code_hash = p_code_hash FOR UPDATE;
  IF NOT FOUND OR NOT v_code.enabled THEN RAISE EXCEPTION 'INVALID_CODE'; END IF;
  IF v_code.not_before IS NOT NULL AND now() < v_code.not_before THEN RAISE EXCEPTION 'CODE_NOT_STARTED'; END IF;
  IF v_code.expires_at IS NOT NULL AND now() >= v_code.expires_at THEN RAISE EXCEPTION 'CODE_EXPIRED'; END IF;
  IF v_code.redeemed_count >= v_code.usage_limit THEN RAISE EXCEPTION 'CODE_EXHAUSTED'; END IF;
  IF EXISTS (SELECT 1 FROM public.redemption_uses WHERE code_id = v_code.id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'CODE_ALREADY_USED';
  END IF;

  IF v_code.reward_type = 'novel' THEN
    -- Defensive compatibility for codes created before the bundle table existed.
    IF NOT EXISTS (SELECT 1 FROM public.redemption_code_novels WHERE code_id = v_code.id) AND v_code.novel_id IS NOT NULL THEN
      INSERT INTO public.redemption_code_novels(code_id, novel_id, sort_order)
      VALUES (v_code.id, v_code.novel_id, 0)
      ON CONFLICT (code_id, novel_id) DO NOTHING;
    END IF;

    SELECT count(*) INTO v_bundle_novel_count
    FROM public.redemption_code_novels
    WHERE code_id = v_code.id;

    SELECT count(*), jsonb_agg(
      jsonb_build_object('novelId', n.id, 'title', n.title, 'author', n.author)
      ORDER BY r.sort_order
    )
    INTO v_available_novel_count, v_novels
    FROM public.redemption_code_novels r
    JOIN public.novel_catalog n ON n.id = r.novel_id
    WHERE r.code_id = v_code.id AND n.enabled;

    IF v_bundle_novel_count = 0 OR v_available_novel_count <> v_bundle_novel_count THEN
      RAISE EXCEPTION 'NOVEL_UNAVAILABLE';
    END IF;

    INSERT INTO public.user_novel_entitlements(user_id, novel_id, source)
    SELECT p_user_id, novel_id, 'redemption'
    FROM public.redemption_code_novels
    WHERE code_id = v_code.id
    ON CONFLICT (user_id, novel_id) DO NOTHING;

    v_snapshot := jsonb_build_object(
      'type', 'novel',
      'novels', v_novels,
      'count', v_available_novel_count,
      'title', CASE WHEN v_available_novel_count = 1 THEN v_novels->0->>'title' ELSE v_available_novel_count || ' 本小说' END,
      'message', '小说已加入你的阅读器'
    );
  ELSE
    v_plan_rank := CASE v_code.plan_code WHEN 'free' THEN 0 WHEN 'plus' THEN 1 WHEN 'pro' THEN 2 WHEN 'ultra' THEN 3 ELSE -1 END;
    SELECT * INTO v_existing FROM public.user_entitlements WHERE user_id = p_user_id FOR UPDATE;
    v_existing_rank := CASE v_existing.plan_code WHEN 'free' THEN 0 WHEN 'plus' THEN 1 WHEN 'pro' THEN 2 WHEN 'ultra' THEN 3 ELSE -1 END;
    IF FOUND AND v_existing_rank > v_plan_rank THEN RAISE EXCEPTION 'PLAN_LOWER_THAN_CURRENT'; END IF;
    v_new_expiry := CASE WHEN FOUND AND v_existing.expires_at IS NULL THEN NULL ELSE GREATEST(COALESCE(v_existing.expires_at, now()), now()) + make_interval(days => v_code.membership_days) END;
    INSERT INTO public.user_entitlements(user_id, plan_code, expires_at, source, updated_at)
    VALUES (p_user_id, v_code.plan_code, v_new_expiry, 'redemption', now())
    ON CONFLICT (user_id) DO UPDATE SET plan_code = EXCLUDED.plan_code, expires_at = EXCLUDED.expires_at, source = 'redemption', updated_at = now();
    v_snapshot := jsonb_build_object(
      'type', 'membership', 'plan', v_code.plan_code, 'days', v_code.membership_days,
      'expiresAt', v_new_expiry, 'message', '会员权益已生效'
    );
  END IF;

  INSERT INTO public.redemption_uses(code_id, user_id, reward_snapshot)
  VALUES (v_code.id, p_user_id, v_snapshot);
  UPDATE public.redemption_codes SET redeemed_count = redeemed_count + 1 WHERE id = v_code.id;
  RETURN v_snapshot;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_reward_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_reward_code(uuid, text) TO service_role;
