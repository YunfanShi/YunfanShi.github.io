-- Commercial admin operations: user directory, account moderation and sync observability.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended')),
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS profiles_account_status_idx ON public.profiles(account_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid, email text, display_name text, avatar_url text, role text,
  account_status text, suspended_reason text, created_at timestamptz,
  updated_at timestamptz, deleted_at timestamptz, focus_sessions bigint,
  legacy_records bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.email, p.display_name, p.avatar_url, p.role,
    p.account_status, p.suspended_reason, p.created_at, p.updated_at, p.deleted_at,
    (SELECT count(*) FROM focus_sessions fs WHERE fs.user_id = p.id),
    (SELECT count(*) FROM legacy_sync_data ls WHERE ls.user_id = p.id)
  FROM profiles p
  WHERE is_admin_user()
  ORDER BY p.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_account_status(target_id uuid, next_status text, reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden: Admin only'; END IF;
  IF target_id = auth.uid() THEN RAISE EXCEPTION 'Administrators cannot change their own account status'; END IF;
  IF next_status NOT IN ('active', 'suspended') THEN RAISE EXCEPTION 'Invalid account status'; END IF;
  UPDATE profiles SET account_status = next_status,
    suspended_reason = CASE WHEN next_status = 'suspended' THEN NULLIF(trim(reason), '') ELSE NULL END,
    status_updated_at = now(), updated_at = now()
  WHERE id = target_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_sync_overview()
RETURNS TABLE (source text, records bigint, most_recent timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 'Legacy bridge'::text, count(*)::bigint, max(updated_at) FROM legacy_sync_data WHERE is_admin_user()
  UNION ALL SELECT 'Focus workspace', count(*)::bigint, max(completed_at) FROM focus_sessions WHERE is_admin_user()
  UNION ALL SELECT 'User preferences', count(*)::bigint, max(updated_at) FROM user_settings WHERE is_admin_user();
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_account_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_sync_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_account_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sync_overview() TO authenticated;
