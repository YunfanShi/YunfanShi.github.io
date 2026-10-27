-- Additive resource-sync schema. Apply as the Azure migration administrator.
BEGIN;
DO $$ BEGIN
  IF current_database()<>'jackyun_migration_20261007' THEN
    RAISE EXCEPTION 'Run only against the designated Azure sync database';
  END IF;
  IF current_user='jackyun_sync_runtime' THEN RAISE EXCEPTION 'Migration administrator required'; END IF;
  IF to_regclass('public.legacy_sync_data') IS NULL OR to_regclass('public.sync_v3_receipts') IS NULL
    OR to_regclass('public.sync_change_heads') IS NULL OR to_regclass('public.sync_change_log') IS NULL THEN
    RAISE EXCEPTION 'Install and verify the existing v4 sync schema first';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jackyun_sync_runtime' AND NOT rolsuper AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'Safe runtime role required';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sync_v5_records (
  user_id uuid NOT NULL,
  scope text NOT NULL CHECK(scope IN ('timetable','learning','cue','practice','timer','settings','workspace')),
  record_id text NOT NULL CHECK(length(record_id) BETWEEN 1 AND 240),
  revision bigint NOT NULL CHECK(revision>0),
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  value jsonb,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,scope,record_id),
  CHECK(deleted_at IS NOT NULL OR value IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.sync_v5_heads (
  user_id uuid NOT NULL,
  scope text NOT NULL CHECK(scope IN ('timetable','learning','cue','practice','timer','settings','workspace')),
  sequence bigint NOT NULL DEFAULT 0 CHECK(sequence>=0),
  retained_after bigint NOT NULL DEFAULT 0 CHECK(retained_after>=0 AND retained_after<=sequence),
  last_pruned_at timestamptz,
  PRIMARY KEY(user_id,scope)
);
CREATE TABLE IF NOT EXISTS public.sync_v5_changes (
  user_id uuid NOT NULL,
  scope text NOT NULL CHECK(scope IN ('timetable','learning','cue','practice','timer','settings','workspace')),
  sequence bigint NOT NULL CHECK(sequence>0),
  record_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,scope,sequence)
);
CREATE INDEX IF NOT EXISTS sync_v5_changes_expiry ON public.sync_v5_changes(created_at);
CREATE TABLE IF NOT EXISTS public.sync_v5_receipts (
  user_id uuid NOT NULL,
  scope text NOT NULL CHECK(scope IN ('timetable','learning','cue','practice','timer','settings','workspace')),
  operation_id uuid NOT NULL,
  request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,scope,operation_id)
);
CREATE TABLE IF NOT EXISTS public.sync_v5_projection_heads (
  user_id uuid PRIMARY KEY,
  revision bigint NOT NULL CHECK(revision>=0),
  content_hash text CHECK(content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE relation text; BEGIN
  FOREACH relation IN ARRAY ARRAY['sync_v5_records','sync_v5_heads','sync_v5_changes','sync_v5_receipts','sync_v5_projection_heads'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',relation);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',relation||'_owner',relation);
    EXECUTE format('CREATE POLICY %I ON public.%I TO jackyun_sync_runtime USING (user_id=(nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid)) WITH CHECK (user_id=(nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid))',relation||'_owner',relation);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',relation);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO jackyun_sync_runtime',relation);
  END LOOP;
END $$;
COMMIT;
