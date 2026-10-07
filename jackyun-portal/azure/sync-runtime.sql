-- Run with psql -X -v ON_ERROR_STOP=1 against the isolated restored database.
-- This is an Azure staging adaptation, not a Supabase migration or API deployment.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $guard$
BEGIN
  IF current_database() !~ '^jackyun_migration_[0-9]{8}$' THEN
    RAISE EXCEPTION 'Only an isolated JackYun migration database is allowed';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jackyun_sync_runtime') THEN
    CREATE ROLE jackyun_sync_runtime NOLOGIN INHERIT NOSUPERUSER
      NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (SELECT FROM pg_roles WHERE rolname = 'jackyun_sync_runtime'
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unexpected privileges on the existing sync runtime role';
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated'
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unexpected privileges on the compatibility role';
  END IF;
  IF EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
    WHERE m.member='jackyun_sync_runtime'::regrole AND r.rolname<>'authenticated')
    OR EXISTS (SELECT FROM pg_class WHERE relowner='jackyun_sync_runtime'::regrole)
    OR EXISTS (SELECT FROM pg_proc WHERE proowner='jackyun_sync_runtime'::regrole)
    OR EXISTS (SELECT FROM pg_namespace WHERE nspowner='jackyun_sync_runtime'::regrole)
    OR EXISTS (SELECT FROM pg_database WHERE datdba='jackyun_sync_runtime'::regrole) THEN
    RAISE EXCEPTION 'Runtime must not inherit other roles or own database objects';
  END IF;
END $guard$;

-- Policy membership supplies TO authenticated; it does not supply table grants.
-- The runtime has no objects and cannot administer or SET ROLE authenticated.
GRANT authenticated TO jackyun_sync_runtime WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
REVOKE ALL ON SCHEMA public, auth, jackyun_private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public, auth, jackyun_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, auth, jackyun_private FROM PUBLIC, anon, authenticated;
-- pg_restore --no-privileges otherwise leaves default PUBLIC function execution.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public, auth, jackyun_private FROM PUBLIC, anon, authenticated;
-- Per-schema REVOKE cannot remove the built-in global PUBLIC EXECUTE default.
-- This affects only future functions created by the current migration operator.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Exposes only the verified caller's status, never the profile row or another ID.
CREATE OR REPLACE FUNCTION public.sync_identity_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
    AND p.deleted_at IS NULL AND p.account_status = 'active');
$$;
REVOKE ALL ON FUNCTION public.sync_identity_allowed() FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public, auth TO jackyun_sync_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legacy_sync_data,
  public.web_sync_devices, public.web_sync_upload_chunks TO jackyun_sync_runtime;
GRANT SELECT, INSERT ON public.sync_operations TO jackyun_sync_runtime;
GRANT SELECT, INSERT, UPDATE ON public.sync_conflicts TO jackyun_sync_runtime;
GRANT EXECUTE ON FUNCTION auth.uid(), public.sync_identity_allowed(), public.normalize_web_sync_value(jsonb),
  public.apply_web_sync_operation(uuid, uuid, text, bigint, text, jsonb, jsonb, text, boolean, timestamptz),
  public.list_web_sync_records(timestamptz, text),
  public.get_web_sync_record_part(text, bigint, integer) TO jackyun_sync_runtime;

DO $grants$
BEGIN
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO jackyun_sync_runtime', current_database());
  IF EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('legacy_sync_data','web_sync_devices',
      'web_sync_upload_chunks','sync_operations','sync_conflicts')
      AND (NOT c.relrowsecurity OR pg_get_userbyid(c.relowner) = 'jackyun_sync_runtime')) THEN
    RAISE EXCEPTION 'Sync runtime must not own tables or bypass their row policies';
  END IF;
END $grants$;
COMMIT;
