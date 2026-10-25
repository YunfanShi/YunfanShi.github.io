CREATE TABLE public.offline_mutation_receipts (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 operation_id uuid NOT NULL, kind text NOT NULL, payload jsonb NOT NULL,
 request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,operation_id)
);
ALTER TABLE public.offline_mutation_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY offline_receipts_owner ON public.offline_mutation_receipts TO authenticated
 USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
REVOKE ALL ON public.offline_mutation_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.offline_mutation_receipts TO authenticated;
CREATE SCHEMA IF NOT EXISTS jackyun_private;
GRANT USAGE ON SCHEMA jackyun_private TO authenticated;

CREATE FUNCTION jackyun_private.apply_offline_mutation(p_operation_id uuid,p_kind text,p_payload jsonb,p_request_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); prior public.offline_mutation_receipts; target uuid;
 item public.review_items; quality integer; next_ease numeric; next_streak integer;
 next_interval integer; stamp timestamptz:=now(); result jsonb; changed integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND account_status='active' AND deleted_at IS NULL)
 THEN RAISE EXCEPTION 'ACCOUNT_DISABLED' USING ERRCODE='42501'; END IF;
 IF p_operation_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
  OR octet_length(p_payload::text)>64000 OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'INVALID_MUTATION' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('offline:'||uid::text,0));
 SELECT * INTO prior FROM public.offline_mutation_receipts WHERE user_id=uid AND operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.kind<>p_kind OR prior.payload<>p_payload OR prior.request_hash<>p_request_hash
  THEN RAISE EXCEPTION 'OPERATION_ID_REUSED' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 IF p_kind IN ('task.toggle','task.delete') THEN
  target:=(p_payload->>'taskId')::uuid;
  IF p_kind='task.toggle' THEN
   UPDATE public.study_tasks SET completed=coalesce((p_payload->>'completed')::boolean,false),
    completed_at=CASE WHEN coalesce((p_payload->>'completed')::boolean,false) THEN stamp ELSE NULL END,
    updated_at=stamp WHERE id=target AND user_id=uid;
  ELSE DELETE FROM public.study_tasks WHERE id=target AND user_id=uid; END IF;
 ELSIF p_kind='task.create' THEN
  IF length(trim(coalesce(p_payload->>'title','')))=0 OR length(p_payload->>'title')>140
  THEN RAISE EXCEPTION 'INVALID_TITLE' USING ERRCODE='22023'; END IF;
  IF nullif(p_payload->>'planId','') IS NOT NULL AND NOT EXISTS
   (SELECT 1 FROM public.study_plans WHERE id=(p_payload->>'planId')::uuid AND user_id=uid)
  THEN RAISE EXCEPTION 'PLAN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.study_tasks(id,user_id,plan_id,title,completed,due_date,estimated_minutes)
   VALUES(p_operation_id,uid,nullif(p_payload->>'planId','')::uuid,trim(p_payload->>'title'),false,
    nullif(p_payload->>'dueDate','')::date,least(360,greatest(10,coalesce((p_payload->>'estimatedMinutes')::integer,25))))
   ON CONFLICT(id) DO NOTHING;
 ELSIF p_kind='plan.delete' THEN
  target:=(p_payload->>'planId')::uuid;
  DELETE FROM public.study_tasks WHERE plan_id=target AND user_id=uid;
  DELETE FROM public.study_plans WHERE id=target AND user_id=uid;
 ELSIF p_kind='review.archive' THEN
  UPDATE public.review_items SET status='archived',updated_at=stamp
   WHERE id=(p_payload->>'reviewItemId')::uuid AND user_id=uid;
 ELSIF p_kind='review.attempt' THEN
  SELECT * INTO item FROM public.review_items WHERE id=(p_payload->>'reviewItemId')::uuid AND user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  quality:=least(5,greatest(0,coalesce((p_payload->>'quality')::integer,0)));
  next_ease:=round(least(3,greatest(1.3,least(3,greatest(1.3,coalesce(nullif(item.ease_factor,0),2.5)))
   +(0.1-(5-quality)*(0.08+(5-quality)*0.02)))),2);
  next_streak:=CASE WHEN quality<3 THEN 0 ELSE item.streak+1 END;
  next_interval:=CASE WHEN quality<3 OR next_streak=1 THEN 1 WHEN next_streak=2 THEN 3
   ELSE greatest(4,round(greatest(1,item.interval_days)*next_ease)::integer) END;
  INSERT INTO public.review_attempts(id,user_id,review_item_id,answer,is_correct,quality,duration_seconds,attempted_at)
   VALUES(p_operation_id,uid,item.id,nullif(left(trim(coalesce(p_payload->>'answer','')),10000),''),quality>=3,
    quality,least(21600,greatest(0,coalesce((p_payload->>'durationSeconds')::integer,0))),stamp);
  UPDATE public.review_items SET interval_days=next_interval,ease_factor=next_ease,streak=next_streak,
   next_review_at=stamp+make_interval(days=>next_interval),
   status=CASE WHEN next_streak>=5 AND next_interval>=30 THEN 'mastered' ELSE 'active' END,
   last_user_answer=nullif(left(trim(coalesce(p_payload->>'answer','')),10000),''),updated_at=stamp
   WHERE id=item.id AND user_id=uid;
 ELSE RAISE EXCEPTION 'UNSUPPORTED_MUTATION' USING ERRCODE='22023'; END IF;
 result:=jsonb_build_object('ok',true,'operationId',p_operation_id,'requestHash',p_request_hash,'state','confirmed','committedAt',stamp);
 INSERT INTO public.offline_mutation_receipts(user_id,operation_id,kind,payload,request_hash,result)
 VALUES(uid,p_operation_id,p_kind,p_payload,p_request_hash,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION jackyun_private.apply_offline_mutation(uuid,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION jackyun_private.apply_offline_mutation(uuid,text,jsonb,text) TO authenticated;

-- Public wrapper exposes only the validated operation, never arbitrary receipt insertion.
CREATE FUNCTION public.apply_offline_mutation(p_operation_id uuid,p_kind text,p_payload jsonb,p_request_hash text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jackyun_private.apply_offline_mutation(p_operation_id,p_kind,p_payload,p_request_hash);
$$;
REVOKE ALL ON FUNCTION public.apply_offline_mutation(uuid,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_offline_mutation(uuid,text,jsonb,text) TO authenticated;
