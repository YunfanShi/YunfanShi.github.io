-- Additive migration. Run as migration administrator, never the runtime login.
BEGIN;
CREATE TABLE IF NOT EXISTS public.sync_change_heads (
  user_id uuid PRIMARY KEY, sequence bigint NOT NULL DEFAULT 0,
  retained_after bigint NOT NULL DEFAULT 0, last_pruned_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.sync_change_log (
  user_id uuid NOT NULL, sequence bigint NOT NULL, storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,sequence)
);
CREATE INDEX IF NOT EXISTS sync_change_log_expiry ON public.sync_change_log(created_at);
ALTER TABLE public.sync_change_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_change_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sync_change_heads_owner ON public.sync_change_heads;
CREATE POLICY sync_change_heads_owner ON public.sync_change_heads TO authenticated
  USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
DROP POLICY IF EXISTS sync_change_log_owner ON public.sync_change_log;
CREATE POLICY sync_change_log_owner ON public.sync_change_log TO authenticated
  USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
REVOKE ALL ON public.sync_change_heads,public.sync_change_log FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.sync_change_heads TO jackyun_sync_runtime;
GRANT SELECT,INSERT,DELETE ON public.sync_change_log TO jackyun_sync_runtime;
CREATE OR REPLACE FUNCTION public.record_sync_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE next_sequence bigint;
BEGIN
  IF TG_OP='UPDATE' AND NEW.revision=OLD.revision
    AND NEW.content_hash IS NOT DISTINCT FROM OLD.content_hash
    AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at THEN RETURN NEW; END IF;
  INSERT INTO public.sync_change_heads(user_id,sequence) VALUES(NEW.user_id,1)
    ON CONFLICT(user_id) DO UPDATE SET sequence=public.sync_change_heads.sequence+1
    RETURNING sequence INTO next_sequence;
  INSERT INTO public.sync_change_log(user_id,sequence,storage_key)
    VALUES(NEW.user_id,next_sequence,NEW.storage_key);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_sync_change() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_sync_change() TO jackyun_sync_runtime;
CREATE OR REPLACE FUNCTION public.prune_sync_changes() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); head public.sync_change_heads; cutoff bigint;
BEGIN
 SELECT * INTO head FROM public.sync_change_heads WHERE user_id=uid FOR UPDATE;
 IF NOT FOUND OR head.last_pruned_at>now()-interval '1 day' THEN RETURN; END IF;
 SELECT max(sequence) INTO cutoff FROM public.sync_change_log
 WHERE user_id=uid AND created_at<now()-interval '30 days';
 IF cutoff IS NOT NULL THEN
  UPDATE public.sync_change_heads SET retained_after=greatest(retained_after,cutoff) WHERE user_id=uid;
  DELETE FROM public.sync_change_log WHERE user_id=uid AND sequence<=cutoff;
 END IF;
 UPDATE public.sync_change_heads SET last_pruned_at=now() WHERE user_id=uid;
END $$;
REVOKE ALL ON FUNCTION public.prune_sync_changes() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prune_sync_changes() TO jackyun_sync_runtime;
DROP TRIGGER IF EXISTS record_sync_change ON public.legacy_sync_data;
CREATE TRIGGER record_sync_change AFTER INSERT OR UPDATE ON public.legacy_sync_data
  FOR EACH ROW EXECUTE FUNCTION public.record_sync_change();
COMMIT;
