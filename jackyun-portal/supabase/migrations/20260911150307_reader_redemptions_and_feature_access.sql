-- Reader cloud sync, catalog, redemption codes and plan-aware feature access.

CREATE TABLE public.app_features (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 240),
  enabled boolean NOT NULL DEFAULT true,
  beta_only boolean NOT NULL DEFAULT false,
  minimum_plan text NOT NULL DEFAULT 'free' REFERENCES public.subscription_plans(code),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_features (key, display_name, description, minimum_plan)
VALUES
  ('reading', 'Reading 阅读器', '本地导入、云书架与阅读进度同步', 'free'),
  ('novel_store', '小说商店', '浏览并领取管理员发布的小说', 'free'),
  ('redemption_center', '兑换码中心', '兑换图书、会员与后续权益', 'free')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE public.novel_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  author text NOT NULL DEFAULT '' CHECK (char_length(author) <= 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  language text NOT NULL DEFAULT 'zh' CHECK (language IN ('zh', 'en')),
  minimum_plan text NOT NULL DEFAULT 'free' REFERENCES public.subscription_plans(code),
  storage_path text NOT NULL UNIQUE,
  original_file_name text NOT NULL CHECK (char_length(original_file_name) BETWEEN 1 AND 240),
  file_size bigint NOT NULL DEFAULT 0 CHECK (file_size >= 0),
  cover_path text,
  enabled boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX novel_catalog_visibility_idx ON public.novel_catalog(enabled, featured DESC, published_at DESC);

CREATE TABLE public.user_novel_entitlements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id uuid NOT NULL REFERENCES public.novel_catalog(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'redemption' CHECK (source IN ('redemption', 'admin', 'purchase')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, novel_id)
);

CREATE TABLE public.reader_books (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id text NOT NULL CHECK (char_length(book_id) BETWEEN 1 AND 120),
  metadata jsonb NOT NULL DEFAULT '{}',
  storage_path text NOT NULL,
  content_hash text NOT NULL DEFAULT '' CHECK (char_length(content_hash) <= 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id),
  CHECK (storage_path = 'users/' || user_id::text || '/' || book_id || '.json')
);
CREATE INDEX reader_books_user_updated_idx ON public.reader_books(user_id, updated_at DESC);

CREATE TABLE public.redemption_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE CHECK (char_length(code_hash) = 64),
  code_prefix text NOT NULL CHECK (char_length(code_prefix) BETWEEN 2 AND 8),
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 120),
  reward_type text NOT NULL CHECK (reward_type IN ('novel', 'membership')),
  novel_id uuid REFERENCES public.novel_catalog(id) ON DELETE CASCADE,
  plan_code text REFERENCES public.subscription_plans(code),
  membership_days integer CHECK (membership_days BETWEEN 1 AND 3650),
  not_before timestamptz,
  expires_at timestamptz,
  usage_limit integer NOT NULL DEFAULT 1 CHECK (usage_limit BETWEEN 1 AND 1000000),
  redeemed_count integer NOT NULL DEFAULT 0 CHECK (redeemed_count BETWEEN 0 AND usage_limit),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR not_before IS NULL OR expires_at > not_before),
  CHECK (
    (reward_type = 'novel' AND novel_id IS NOT NULL AND plan_code IS NULL AND membership_days IS NULL)
    OR
    (reward_type = 'membership' AND novel_id IS NULL AND plan_code IS NOT NULL AND membership_days IS NOT NULL)
  )
);
CREATE INDEX redemption_codes_status_idx ON public.redemption_codes(enabled, expires_at, redeemed_count);

CREATE TABLE public.redemption_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES public.redemption_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_snapshot jsonb NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code_id, user_id)
);
CREATE INDEX redemption_uses_user_idx ON public.redemption_uses(user_id, redeemed_at DESC);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'novel-files', 'novel-files', false, 52428800,
  ARRAY['text/plain', 'text/markdown', 'text/html', 'application/epub+zip', 'application/json', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = false;

ALTER TABLE public.app_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.novel_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_novel_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reader_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemption_uses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_features, public.novel_catalog, public.user_novel_entitlements, public.reader_books, public.redemption_codes, public.redemption_uses FROM anon, authenticated;
GRANT SELECT ON TABLE public.app_features, public.novel_catalog, public.user_novel_entitlements, public.reader_books, public.redemption_uses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.reader_books TO authenticated;

CREATE POLICY "Users view own novel entitlements" ON public.user_novel_entitlements
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users view own reader books" ON public.reader_books
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users create own reader books" ON public.reader_books
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users update own reader books" ON public.reader_books
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users delete own reader books" ON public.reader_books
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users view own redemptions" ON public.redemption_uses
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users manage own reader files" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'novel-files' AND (storage.foldername(name))[1] = 'users' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'novel-files' AND (storage.foldername(name))[1] = 'users' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text);

CREATE OR REPLACE FUNCTION public.redeem_reward_code(p_user_id uuid, p_code_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code public.redemption_codes%ROWTYPE;
  v_novel public.novel_catalog%ROWTYPE;
  v_existing public.user_entitlements%ROWTYPE;
  v_snapshot jsonb;
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
    SELECT * INTO v_novel FROM public.novel_catalog WHERE id = v_code.novel_id AND enabled;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOVEL_UNAVAILABLE'; END IF;
    INSERT INTO public.user_novel_entitlements(user_id, novel_id, source)
    VALUES (p_user_id, v_novel.id, 'redemption')
    ON CONFLICT (user_id, novel_id) DO NOTHING;
    v_snapshot := jsonb_build_object(
      'type', 'novel', 'title', v_novel.title, 'author', v_novel.author,
      'novelId', v_novel.id, 'message', '小说已加入你的账户'
    );
  ELSE
    v_plan_rank := CASE v_code.plan_code WHEN 'free' THEN 0 WHEN 'plus' THEN 1 WHEN 'pro' THEN 2 WHEN 'ultra' THEN 3 ELSE -1 END;
    SELECT * INTO v_existing FROM public.user_entitlements WHERE user_id = p_user_id FOR UPDATE;
    v_existing_rank := CASE WHEN NOT FOUND OR v_existing.expires_at <= now() THEN -1 ELSE CASE v_existing.plan_code WHEN 'free' THEN 0 WHEN 'plus' THEN 1 WHEN 'pro' THEN 2 WHEN 'ultra' THEN 3 ELSE -1 END END;
    IF v_existing_rank > v_plan_rank THEN RAISE EXCEPTION 'PLAN_LOWER_THAN_CURRENT'; END IF;
    v_new_expiry := CASE
      WHEN v_existing_rank = v_plan_rank AND v_existing.expires_at IS NULL THEN NULL
      WHEN v_existing_rank = v_plan_rank AND v_existing.expires_at > now() THEN v_existing.expires_at + make_interval(days => v_code.membership_days)
      ELSE now() + make_interval(days => v_code.membership_days)
    END;
    INSERT INTO public.user_entitlements(user_id, plan_code, expires_at, updated_at)
    VALUES (p_user_id, v_code.plan_code, v_new_expiry, now())
    ON CONFLICT (user_id) DO UPDATE SET plan_code = EXCLUDED.plan_code, expires_at = EXCLUDED.expires_at, updated_at = now();
    v_snapshot := jsonb_build_object(
      'type', 'membership', 'plan', upper(v_code.plan_code), 'days', v_code.membership_days,
      'expiresAt', v_new_expiry, 'message', upper(v_code.plan_code) || ' 会员已到账'
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
