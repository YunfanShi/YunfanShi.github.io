-- Azure-only hardening of the one SECURITY DEFINER lookup. No application rows change.
BEGIN;
DO $guard$
BEGIN
  IF current_database() !~ '^jackyun_migration_[0-9]{8}$' THEN
    RAISE EXCEPTION 'Only the isolated migration database is allowed';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jackyun_sync_identity_owner') THEN
    CREATE ROLE jackyun_sync_identity_owner NOLOGIN NOINHERIT NOSUPERUSER
      NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='jackyun_sync_identity_owner'
    AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN
    RAISE EXCEPTION 'Unexpected identity lookup owner privileges';
  END IF;
END $guard$;
GRANT USAGE ON SCHEMA public, auth TO jackyun_sync_identity_owner;
GRANT SELECT(id, deleted_at, account_status) ON public.profiles TO jackyun_sync_identity_owner;
GRANT EXECUTE ON FUNCTION auth.uid() TO jackyun_sync_identity_owner;
DROP POLICY IF EXISTS azure_sync_identity_lookup ON public.profiles;
CREATE POLICY azure_sync_identity_lookup ON public.profiles FOR SELECT
  TO jackyun_sync_identity_owner USING (id = (SELECT auth.uid()));
DO $owner$
BEGIN
  EXECUTE format('GRANT jackyun_sync_identity_owner TO %I WITH INHERIT FALSE, SET TRUE, ADMIN FALSE', current_user);
  EXECUTE format('GRANT CREATE ON SCHEMA public TO jackyun_sync_identity_owner');
  ALTER FUNCTION public.sync_identity_allowed() OWNER TO jackyun_sync_identity_owner;
  REVOKE CREATE ON SCHEMA public FROM jackyun_sync_identity_owner;
  EXECUTE format('REVOKE jackyun_sync_identity_owner FROM %I', current_user);
END $owner$;
REVOKE ALL ON FUNCTION public.sync_identity_allowed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_identity_allowed() TO jackyun_sync_runtime;
COMMIT;
