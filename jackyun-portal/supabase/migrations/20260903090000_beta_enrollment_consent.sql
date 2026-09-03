-- Administrator-invited BETA enrollment with explicit user consent.

CREATE TABLE IF NOT EXISTS public.beta_enrollments (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'accepted', 'declined', 'revoked')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  agreement_version text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.beta_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.beta_enrollments FROM anon, authenticated;
GRANT SELECT ON TABLE public.beta_enrollments TO authenticated;

CREATE POLICY "Users view own BETA enrollment"
  ON public.beta_enrollments FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Administrators view BETA enrollments"
  ON public.beta_enrollments FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE OR REPLACE FUNCTION public.respond_to_beta_invitation(
  p_accept boolean,
  p_agreement_version text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_agreement_version IS NULL OR char_length(trim(p_agreement_version)) > 40 THEN
    RAISE EXCEPTION 'Invalid agreement version';
  END IF;

  UPDATE public.beta_enrollments
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
      agreement_version = trim(p_agreement_version),
      responded_at = now(),
      updated_at = now()
  WHERE user_id = auth.uid() AND status = 'invited';

  IF NOT FOUND THEN RAISE EXCEPTION 'No pending BETA invitation'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_beta_invitation(
  p_user_id uuid,
  p_invited boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'Forbidden: Admin only'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Administrators cannot change their own BETA enrollment'; END IF;

  INSERT INTO public.beta_enrollments (
    user_id, status, invited_by, invited_at, responded_at, agreement_version, updated_at
  ) VALUES (
    p_user_id,
    CASE WHEN p_invited THEN 'invited' ELSE 'revoked' END,
    auth.uid(), now(), NULL, NULL, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    status = EXCLUDED.status,
    invited_by = EXCLUDED.invited_by,
    invited_at = EXCLUDED.invited_at,
    responded_at = NULL,
    agreement_version = NULL,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_beta_enrollments()
RETURNS TABLE (
  user_id uuid,
  status text,
  invited_at timestamptz,
  responded_at timestamptz,
  agreement_version text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT b.user_id, b.status, b.invited_at, b.responded_at, b.agreement_version
  FROM public.beta_enrollments b
  WHERE public.is_admin_user();
$$;

REVOKE ALL ON FUNCTION public.respond_to_beta_invitation(boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_beta_invitation(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_beta_enrollments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_beta_invitation(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_beta_invitation(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_beta_enrollments() TO authenticated;

