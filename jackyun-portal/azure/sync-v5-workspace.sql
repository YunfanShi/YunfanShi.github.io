-- Add the legacy workspace resource namespace without changing existing rows.
BEGIN;
DO $$ BEGIN
  IF current_database() NOT IN ('jackyun_migration_20261007','jackyun_v5_stage_20261026') THEN
    RAISE EXCEPTION 'Run only against the designated Azure sync database';
  END IF;
  IF current_user='jackyun_sync_runtime' THEN RAISE EXCEPTION 'Migration administrator required'; END IF;
  IF to_regclass('public.sync_v5_records') IS NULL OR to_regclass('public.sync_v5_heads') IS NULL
    OR to_regclass('public.sync_v5_changes') IS NULL OR to_regclass('public.sync_v5_receipts') IS NULL THEN
    RAISE EXCEPTION 'Install the v5 resource schema first';
  END IF;
END $$;

LOCK TABLE public.sync_v5_records,public.sync_v5_heads,public.sync_v5_changes,public.sync_v5_receipts
  IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE v5_scope_schema_audit(table_name text PRIMARY KEY,row_count bigint,fingerprint text) ON COMMIT DROP;
DO $$ DECLARE target text; total bigint; content_hash text; BEGIN
  FOREACH target IN ARRAY ARRAY['sync_v5_records','sync_v5_heads','sync_v5_changes','sync_v5_receipts'] LOOP
    EXECUTE format($query$SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(row_hash,'' ORDER BY row_hash),''),'UTF8')),'hex')
      FROM (SELECT encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') AS row_hash FROM public.%I r) hashes$query$,target)
      INTO total,content_hash;
    INSERT INTO v5_scope_schema_audit VALUES(target,total,content_hash);
  END LOOP;
END $$;

ALTER TABLE public.sync_v5_records DROP CONSTRAINT IF EXISTS sync_v5_records_scope_check;
ALTER TABLE public.sync_v5_records ADD CONSTRAINT sync_v5_records_scope_check
  CHECK(scope IN ('timetable','learning','cue','practice','timer','settings','workspace')) NOT VALID;
ALTER TABLE public.sync_v5_records VALIDATE CONSTRAINT sync_v5_records_scope_check;

ALTER TABLE public.sync_v5_heads DROP CONSTRAINT IF EXISTS sync_v5_heads_scope_check;
ALTER TABLE public.sync_v5_heads ADD CONSTRAINT sync_v5_heads_scope_check
  CHECK(scope IN ('timetable','learning','cue','practice','timer','settings','workspace')) NOT VALID;
ALTER TABLE public.sync_v5_heads VALIDATE CONSTRAINT sync_v5_heads_scope_check;

ALTER TABLE public.sync_v5_changes DROP CONSTRAINT IF EXISTS sync_v5_changes_scope_check;
ALTER TABLE public.sync_v5_changes ADD CONSTRAINT sync_v5_changes_scope_check
  CHECK(scope IN ('timetable','learning','cue','practice','timer','settings','workspace')) NOT VALID;
ALTER TABLE public.sync_v5_changes VALIDATE CONSTRAINT sync_v5_changes_scope_check;

ALTER TABLE public.sync_v5_receipts DROP CONSTRAINT IF EXISTS sync_v5_receipts_scope_check;
ALTER TABLE public.sync_v5_receipts ADD CONSTRAINT sync_v5_receipts_scope_check
  CHECK(scope IN ('timetable','learning','cue','practice','timer','settings','workspace')) NOT VALID;
ALTER TABLE public.sync_v5_receipts VALIDATE CONSTRAINT sync_v5_receipts_scope_check;

DO $$ DECLARE baseline record; total bigint; content_hash text; BEGIN
  FOR baseline IN SELECT * FROM v5_scope_schema_audit LOOP
    EXECUTE format($query$SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(row_hash,'' ORDER BY row_hash),''),'UTF8')),'hex')
      FROM (SELECT encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') AS row_hash FROM public.%I r) hashes$query$,baseline.table_name)
      INTO total,content_hash;
    IF total IS DISTINCT FROM baseline.row_count OR content_hash IS DISTINCT FROM baseline.fingerprint THEN
      RAISE EXCEPTION 'Existing v5 rows changed during scope migration';
    END IF;
  END LOOP;
END $$;
SELECT table_name,row_count,fingerprint,true AS rows_unchanged FROM v5_scope_schema_audit ORDER BY table_name;
COMMIT;
