-- Keep existing function identity, owner and grants; change only conflict policy.
-- No current business rows are overwritten or deleted by this migration.
BEGIN READ WRITE;
SET LOCAL lock_timeout='5s';
DO $migration$
DECLARE definition text; hardened text;
BEGIN
  SELECT pg_get_functiondef('public.apply_web_sync_operation(uuid,uuid,text,bigint,text,jsonb,jsonb,text,boolean,timestamptz)'::regprocedure) INTO definition;
  IF position('SYNC_CAS_V3' in definition)=0 THEN
    IF position('effective_updated_at > current_record.client_updated_at' in definition)=0
      OR position('local_wins :=' in definition)=0 THEN
      RAISE EXCEPTION 'Unknown sync function layout; migration aborted without modifying data';
    END IF;
    hardened:=regexp_replace(definition,'local_wins :=[^;]+;',
      'local_wins := (current_record.revision = p_base_revision AND current_record.content_hash IS NOT DISTINCT FROM p_base_hash); -- SYNC_CAS_V3');
    hardened:=replace(hardened,'elsif (current_record.deleted_at is not null) = p_deleted',
      'elsif current_record.revision = p_base_revision AND current_record.content_hash IS NOT DISTINCT FROM p_base_hash AND (current_record.deleted_at is not null) = p_deleted');
    hardened:=replace(hardened,'if not found then',
      'if not found then
        if p_base_revision <> 0 or p_base_hash is not null then raise exception ''SYNC_BASE_MISSING''; end if;');
    hardened:=replace(hardened,'''updatedAt'', effective_updated_at','''updatedAt'', now()');
    hardened:=replace(hardened,'''updatedAt'', current_record.client_updated_at','''updatedAt'', current_record.updated_at');
    IF hardened=definition OR position('effective_updated_at > current_record.client_updated_at' in hardened)>0
      OR position('SYNC_BASE_MISSING' in hardened)=0 THEN RAISE EXCEPTION 'CAS transformation incomplete'; END IF;
    EXECUTE hardened;
  END IF;
END $migration$;

-- Immutable request fingerprints avoid granting UPDATE on the receipt ledger.
CREATE TABLE IF NOT EXISTS public.sync_v3_receipts (
  user_id uuid NOT NULL, operation_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,operation_id)
);
ALTER TABLE public.sync_v3_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_v3_receipt_read ON public.sync_v3_receipts;
CREATE POLICY sync_v3_receipt_read ON public.sync_v3_receipts FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
DROP POLICY IF EXISTS sync_v3_receipt_insert ON public.sync_v3_receipts;
CREATE POLICY sync_v3_receipt_insert ON public.sync_v3_receipts FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=user_id);
REVOKE ALL ON public.sync_v3_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.sync_v3_receipts TO authenticated;

CREATE TABLE IF NOT EXISTS public.sync_record_history (
  user_id uuid NOT NULL,storage_key text NOT NULL,revision bigint NOT NULL,
  storage_value jsonb NOT NULL,content_hash text,deleted_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),source_updated_at timestamptz,
  PRIMARY KEY(user_id,storage_key,revision)
);
ALTER TABLE public.sync_record_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_history_read ON public.sync_record_history;
CREATE POLICY sync_history_read ON public.sync_record_history FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
REVOKE ALL ON public.sync_record_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.sync_record_history TO authenticated;
CREATE OR REPLACE FUNCTION public.capture_sync_record_preimage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $history$
BEGIN
  INSERT INTO public.sync_record_history(user_id,storage_key,revision,storage_value,content_hash,deleted_at,source_updated_at)
  VALUES(OLD.user_id,OLD.storage_key,OLD.revision,OLD.storage_value,OLD.content_hash,OLD.deleted_at,OLD.updated_at)
  ON CONFLICT(user_id,storage_key,revision) DO NOTHING;
  -- Bounded per-key history, independent of periodic page backups. Existing
  -- Schedule/page backup histories remain untouched by this retention rule.
  DELETE FROM public.sync_record_history h WHERE h.user_id=OLD.user_id AND h.storage_key=OLD.storage_key
    AND h.revision NOT IN (SELECT r.revision FROM public.sync_record_history r
      WHERE r.user_id=OLD.user_id AND r.storage_key=OLD.storage_key ORDER BY r.revision DESC LIMIT 10);
  RETURN NEW;
END $history$;
REVOKE ALL ON FUNCTION public.capture_sync_record_preimage() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS sync_record_preimage ON public.legacy_sync_data;
CREATE TRIGGER sync_record_preimage BEFORE UPDATE ON public.legacy_sync_data FOR EACH ROW
WHEN (OLD.storage_value IS DISTINCT FROM NEW.storage_value OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR OLD.revision IS DISTINCT FROM NEW.revision)
EXECUTE FUNCTION public.capture_sync_record_preimage();
DO $runtime$
BEGIN
  IF EXISTS(SELECT FROM pg_roles WHERE rolname='jackyun_sync_runtime') THEN
    GRANT SELECT,INSERT ON public.sync_v3_receipts TO jackyun_sync_runtime;
    GRANT SELECT ON public.sync_record_history TO jackyun_sync_runtime;
    REVOKE ALL ON public.sync_v3_receipts,public.sync_record_history FROM authenticated;
  END IF;
END $runtime$;
COMMIT;
