-- Administrator ownership, auditable AI quota resets, management notices,
-- and administrator-initiated support conversations.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_super_admin_requires_admin
  CHECK (NOT is_super_admin OR role = 'admin');

-- Preserve the original installation owner: the earliest existing admin is
-- promoted only when an owner has not already been selected.
UPDATE public.profiles
SET is_super_admin = true
WHERE id = (
  SELECT id FROM public.profiles
  WHERE role = 'admin'
  ORDER BY created_at, id
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE is_super_admin);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_single_super_admin_idx
  ON public.profiles ((is_super_admin)) WHERE is_super_admin;

CREATE OR REPLACE FUNCTION public.protect_profile_administration_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- RLS limits users to their own row but does not provide column-level
  -- protection. Prevent direct API updates from changing authority fields.
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.role := OLD.role;
    NEW.is_super_admin := OLD.is_super_admin;
    NEW.account_status := OLD.account_status;
    NEW.suspended_reason := OLD.suspended_reason;
    NEW.suspended_explanation := OLD.suspended_explanation;
  END IF;
  -- If an installation had no admin during migration, the first privileged
  -- bootstrap becomes its one owner. Later promotions remain normal admins.
  IF OLD.role <> 'admin' AND NEW.role = 'admin'
    AND NOT EXISTS (SELECT 1 FROM profiles WHERE is_super_admin AND id <> NEW.id) THEN
    NEW.is_super_admin := true;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_profile_administration_fields ON public.profiles;
CREATE TRIGGER protect_profile_administration_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_administration_fields();

CREATE OR REPLACE FUNCTION public.is_super_admin_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin' AND is_super_admin
  );
$$;

REVOKE ALL ON FUNCTION public.is_super_admin_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin_user() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid, email text, display_name text, avatar_url text, role text,
  is_super_admin boolean, account_status text, suspended_reason text,
  suspended_explanation text, created_at timestamptz, updated_at timestamptz,
  deleted_at timestamptz, focus_sessions bigint, legacy_records bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.email, p.display_name, p.avatar_url, p.role,
    p.is_super_admin, p.account_status, p.suspended_reason,
    p.suspended_explanation, p.created_at, p.updated_at, p.deleted_at,
    (SELECT count(*) FROM focus_sessions fs WHERE fs.user_id = p.id),
    (SELECT count(*) FROM legacy_sync_data ls WHERE ls.user_id = p.id)
  FROM profiles p
  WHERE is_admin_user()
  ORDER BY p.created_at DESC;
$$;

CREATE INDEX IF NOT EXISTS focus_sessions_user_id_idx ON public.focus_sessions(user_id);
CREATE INDEX IF NOT EXISTS legacy_sync_data_user_id_idx ON public.legacy_sync_data(user_id);

CREATE OR REPLACE FUNCTION public.admin_set_account_status(
  target_id uuid,
  next_status text,
  reason text DEFAULT NULL,
  explanation text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE target_name text;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden: Admin only'; END IF;
  IF target_id = auth.uid() THEN RAISE EXCEPTION 'Administrators cannot change their own account status'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = target_id AND is_super_admin) THEN
    RAISE EXCEPTION 'The super administrator account cannot be suspended';
  END IF;
  IF next_status NOT IN ('active', 'suspended') THEN RAISE EXCEPTION 'Invalid account status'; END IF;
  IF next_status = 'suspended' AND char_length(trim(COALESCE(reason, ''))) = 0 THEN
    RAISE EXCEPTION 'Suspension reason is required';
  END IF;

  UPDATE profiles SET
    account_status = next_status,
    suspended_reason = CASE WHEN next_status = 'suspended' THEN trim(reason) ELSE NULL END,
    suspended_explanation = CASE WHEN next_status = 'suspended' THEN NULLIF(trim(explanation), '') ELSE NULL END,
    status_updated_at = now(), updated_at = now()
  WHERE id = target_id
  RETURNING COALESCE(display_name, email, '用户') INTO target_name;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;

  INSERT INTO site_notifications(title, content, content_type, delivery_type, recipient_user_id, created_by)
  VALUES (
    CASE WHEN next_status = 'suspended' THEN '账户已暂停' ELSE '账户已恢复' END,
    CASE WHEN next_status = 'suspended'
      THEN '管理员已暂停你的账户。原因：' || trim(reason) ||
        CASE WHEN NULLIF(trim(explanation), '') IS NULL THEN '' ELSE E'\n\n说明：' || trim(explanation) END
      ELSE '管理员已恢复你的账户，现在可以继续正常使用。' END,
    'markdown', 'message', target_id, auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE old_role text; target_is_owner boolean;
BEGIN
  IF NOT public.is_super_admin_user() THEN RAISE EXCEPTION 'Forbidden: Super administrator only'; END IF;
  IF p_role NOT IN ('user', 'admin') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  SELECT role, is_super_admin INTO old_role, target_is_owner
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF target_is_owner AND p_role <> 'admin' THEN RAISE EXCEPTION 'The super administrator cannot be demoted'; END IF;

  UPDATE public.profiles SET role = p_role, updated_at = now() WHERE id = p_user_id;
  IF old_role IS DISTINCT FROM p_role THEN
    INSERT INTO public.site_notifications(title, content, content_type, delivery_type, recipient_user_id, created_by)
    VALUES (
      CASE WHEN p_role = 'admin' THEN '你已成为管理员' ELSE '管理员权限已撤销' END,
      CASE WHEN p_role = 'admin'
        THEN '超级管理员已授予你管理员权限。请谨慎使用管理功能。'
        ELSE '超级管理员已将你的账户恢复为普通用户。' END,
      'markdown', 'message', p_user_id, auth.uid()
    );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.ai_quota_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('daily', 'monthly')),
  reset_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_quota_resets_user_created_idx
  ON public.ai_quota_resets(user_id, created_at DESC);
ALTER TABLE public.ai_quota_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_quota_resets FROM anon, authenticated;
GRANT SELECT ON TABLE public.ai_quota_resets TO authenticated;
CREATE POLICY "Users view own AI quota resets" ON public.ai_quota_resets
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.admin_reset_ai_quota(p_user_id uuid, p_scope text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'Forbidden: Admin only'; END IF;
  IF p_scope NOT IN ('daily', 'monthly') THEN RAISE EXCEPTION 'Invalid quota reset scope'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN RAISE EXCEPTION 'User not found'; END IF;

  INSERT INTO public.ai_quota_resets(user_id, scope, reset_by)
  VALUES (p_user_id, p_scope, auth.uid());
  INSERT INTO public.site_notifications(title, content, content_type, delivery_type, recipient_user_id, created_by)
  VALUES (
    CASE WHEN p_scope = 'daily' THEN '每日 AI 额度已重置' ELSE '每月 AI 额度已重置' END,
    CASE WHEN p_scope = 'daily'
      THEN '管理员已重置你的今日平台 AI Token 用量，你可以立即重新使用今日额度。'
      ELSE '管理员已重置你的本月平台 AI Token 用量，你可以立即重新使用本月额度。' END,
    'markdown', 'message', p_user_id, auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_start_user_chat(p_user_id uuid, p_subject text, p_body text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE report_id uuid;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden: Admin only'; END IF;
  IF char_length(trim(p_subject)) NOT BETWEEN 1 AND 120 OR char_length(trim(p_body)) NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Subject or message is invalid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN RAISE EXCEPTION 'User not found'; END IF;

  INSERT INTO bug_reports(user_id, title, description, severity, status, ticket_type, page_url)
  VALUES (p_user_id, trim(p_subject), trim(p_body), 'normal', 'in_progress', 'usage_help', '/admin/users')
  RETURNING id INTO report_id;
  INSERT INTO support_replies(report_id, author_id, body)
  VALUES (report_id, auth.uid(), trim(p_body));
  INSERT INTO site_notifications(title, content, content_type, delivery_type, recipient_user_id, related_ticket_id, created_by)
  VALUES ('管理员消息：' || trim(p_subject), '你收到一条管理员私信。点击打开对话并回复。', 'markdown', 'message', p_user_id, report_id, auth.uid());
  RETURN report_id;
END;
$$;

-- Quota reservations count usage only after the latest relevant reset.
CREATE OR REPLACE FUNCTION public.reserve_ai_usage(p_user_id uuid, p_feature text, p_input_tokens bigint, p_requested_output integer, p_model text)
RETURNS TABLE (reservation_id uuid, allowed_output_tokens integer, plan_code text, daily_remaining bigint, monthly_remaining bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_plan public.subscription_plans%ROWTYPE; v_bonus bigint := 0;
  v_daily_used bigint; v_monthly_used bigint; v_allowed_output integer;
  v_reserved bigint; v_id uuid; v_site_generations bigint;
  v_recent_requests bigint; v_concurrent_requests bigint;
  v_daily_since timestamptz := date_trunc('day', now());
  v_monthly_since timestamptz := date_trunc('month', now());
BEGIN
  IF p_input_tokens < 0 OR p_input_tokens > 50000 THEN RAISE EXCEPTION 'Invalid input token count'; END IF;
  SELECT p.* INTO v_plan FROM public.subscription_plans p
  LEFT JOIN public.user_entitlements e ON e.plan_code = p.code AND e.user_id = p_user_id AND (e.expires_at IS NULL OR e.expires_at > now())
  WHERE p.code = COALESCE(e.plan_code, 'free') LIMIT 1;
  IF NOT FOUND THEN SELECT * INTO v_plan FROM public.subscription_plans WHERE code = 'free'; END IF;
  SELECT COALESCE(e.bonus_tokens, 0) INTO v_bonus FROM public.user_entitlements e WHERE e.user_id = p_user_id AND (e.expires_at IS NULL OR e.expires_at > now());
  v_bonus := COALESCE(v_bonus, 0);
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));
  SELECT GREATEST(v_daily_since, COALESCE(max(created_at), v_daily_since)) INTO v_daily_since
    FROM public.ai_quota_resets WHERE user_id = p_user_id AND scope IN ('daily', 'monthly');
  SELECT GREATEST(v_monthly_since, COALESCE(max(created_at), v_monthly_since)) INTO v_monthly_since
    FROM public.ai_quota_resets WHERE user_id = p_user_id AND scope = 'monthly';
  UPDATE public.ai_usage_ledger SET status = 'failed', billed_tokens = 0, settled_at = now() WHERE user_id = p_user_id AND status = 'reserved' AND created_at < now() - interval '5 minutes';
  SELECT count(*) INTO v_recent_requests FROM public.ai_usage_ledger WHERE user_id = p_user_id AND created_at >= now() - interval '1 minute';
  SELECT count(*) INTO v_concurrent_requests FROM public.ai_usage_ledger WHERE user_id = p_user_id AND status = 'reserved';
  IF v_recent_requests >= 30 THEN RAISE EXCEPTION 'RATE_LIMIT_EXCEEDED'; END IF;
  IF v_concurrent_requests >= 3 THEN RAISE EXCEPTION 'CONCURRENT_LIMIT_EXCEEDED'; END IF;
  SELECT COALESCE(sum(CASE WHEN status = 'reserved' THEN reserved_tokens ELSE billed_tokens END), 0) INTO v_daily_used FROM public.ai_usage_ledger WHERE user_id = p_user_id AND created_at >= v_daily_since;
  SELECT COALESCE(sum(CASE WHEN status = 'reserved' THEN reserved_tokens ELSE billed_tokens END), 0) INTO v_monthly_used FROM public.ai_usage_ledger WHERE user_id = p_user_id AND created_at >= v_monthly_since;
  v_allowed_output := LEAST(GREATEST(p_requested_output, 1), v_plan.max_output_tokens);
  v_reserved := p_input_tokens + (v_allowed_output * 2);
  IF p_feature = 'personal_site' THEN
    SELECT count(*) INTO v_site_generations FROM public.ai_usage_ledger WHERE user_id = p_user_id AND feature = 'personal_site' AND status IN ('reserved', 'completed') AND created_at >= v_monthly_since;
    IF v_site_generations >= v_plan.monthly_site_generations THEN RAISE EXCEPTION 'SITE_GENERATION_QUOTA_EXCEEDED'; END IF;
  END IF;
  IF v_daily_used + v_reserved > v_plan.daily_token_limit THEN RAISE EXCEPTION 'DAILY_QUOTA_EXCEEDED'; END IF;
  IF v_monthly_used + v_reserved > v_plan.monthly_token_limit + v_bonus THEN RAISE EXCEPTION 'MONTHLY_QUOTA_EXCEEDED'; END IF;
  INSERT INTO public.ai_usage_ledger(user_id, feature, model, reserved_tokens) VALUES (p_user_id, left(p_feature, 64), left(COALESCE(p_model, ''), 160), v_reserved) RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, v_allowed_output, v_plan.code, v_plan.daily_token_limit - v_daily_used - v_reserved, v_plan.monthly_token_limit + v_bonus - v_monthly_used - v_reserved;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_ai_quota(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_start_user_chat(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_ai_quota(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_start_user_chat(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.reserve_ai_usage(uuid, text, bigint, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(uuid, text, bigint, integer, text) TO service_role;

-- BETA invitations and revocations are management events and must be visible
-- in the recipient's message history.
CREATE OR REPLACE FUNCTION public.admin_set_beta_invitation(p_user_id uuid, p_invited boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE is_self boolean := p_user_id = auth.uid();
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'Forbidden: Admin only'; END IF;
  INSERT INTO public.beta_enrollments(user_id, status, invited_by, invited_at, responded_at, agreement_version, updated_at)
  VALUES (p_user_id, CASE WHEN p_invited AND is_self THEN 'accepted' WHEN p_invited THEN 'invited' ELSE 'revoked' END,
    auth.uid(), now(), CASE WHEN p_invited AND is_self THEN now() ELSE NULL END,
    CASE WHEN p_invited AND is_self THEN 'admin-self-enrollment-v1' ELSE NULL END, now())
  ON CONFLICT (user_id) DO UPDATE SET status = excluded.status, invited_by = excluded.invited_by,
    invited_at = excluded.invited_at, responded_at = excluded.responded_at,
    agreement_version = excluded.agreement_version, updated_at = now();
  IF NOT is_self THEN
    INSERT INTO public.site_notifications(title, content, content_type, delivery_type, recipient_user_id, created_by)
    VALUES (CASE WHEN p_invited THEN 'BETA 测试邀请' ELSE 'BETA 测试资格已撤销' END,
      CASE WHEN p_invited THEN '管理员邀请你参加 BETA 测试。请进入网站阅读协议并选择是否加入。' ELSE '管理员已撤销你的 BETA 测试资格，你的发布通道已恢复为 Stable。' END,
      'markdown', 'message', p_user_id, auth.uid());
  END IF;
END;
$$;
