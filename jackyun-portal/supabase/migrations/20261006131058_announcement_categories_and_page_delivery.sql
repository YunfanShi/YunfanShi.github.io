-- Backwards-compatible metadata for public announcements. Private support messages retain their defaults.
ALTER TABLE public.site_notifications
  ADD COLUMN category text NOT NULL DEFAULT 'general' CHECK (category IN ('general','update','bug','maintenance','feature','event')),
  ADD COLUMN priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','important','urgent')),
  ADD COLUMN is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN scope_type text NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global','pages')),
  ADD COLUMN target_paths text[] NOT NULL DEFAULT '{}',
  ADD COLUMN incident_status text NOT NULL DEFAULT 'none' CHECK (incident_status IN ('none','investigating','identified','monitoring','resolved')),
  ADD COLUMN action_label text,
  ADD COLUMN action_url text,
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  ADD CONSTRAINT announcement_scope_check CHECK (cardinality(target_paths) <= 30 AND (scope_type = 'global' OR cardinality(target_paths) > 0)),
  ADD CONSTRAINT announcement_action_check CHECK ((action_label IS NULL AND action_url IS NULL) OR
    (action_label IS NOT NULL AND length(trim(action_label)) > 0 AND action_url IS NOT NULL AND
      (action_url ~ '^/[^/\\[:space:]]' OR action_url = '/' OR action_url ~ '^https://[^/@[:space:]]+([/:?#]|$)') AND action_url !~ '[\\[:space:]]' AND action_url !~ '^https://[^/]*@'));
ALTER TABLE public.site_notifications DROP CONSTRAINT site_notifications_delivery_type_check;
ALTER TABLE public.site_notifications ADD CONSTRAINT site_notifications_delivery_type_check CHECK (delivery_type IN ('notice','message','banner'));
CREATE INDEX site_notifications_public_delivery_idx ON public.site_notifications (is_active, is_pinned DESC, created_at DESC) WHERE recipient_user_id IS NULL;

CREATE OR REPLACE FUNCTION public.create_site_notification(payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid; paths text[];
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden: Admin only'; END IF;
  IF nullif(trim(coalesce(payload->>'title','')), '') IS NULL AND nullif(trim(coalesce(payload->>'content','')), '') IS NULL THEN RAISE EXCEPTION 'Title or content required'; END IF;
  SELECT coalesce(array_agg(value), '{}') INTO paths FROM jsonb_array_elements_text(coalesce(payload->'target_paths', '[]'));
  IF EXISTS (SELECT 1 FROM unnest(paths) AS path WHERE path IS NULL OR path !~ '^/([A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*)?$') THEN RAISE EXCEPTION 'Invalid target page'; END IF;
  IF nullif(payload->>'start_time','') IS NOT NULL AND nullif(payload->>'end_time','') IS NOT NULL AND (payload->>'end_time')::timestamptz <= (payload->>'start_time')::timestamptz THEN RAISE EXCEPTION 'End must follow start'; END IF;
  INSERT INTO public.site_notifications (title, content, content_type, delivery_type, is_active, start_time, end_time, created_by,
    category, priority, is_pinned, scope_type, target_paths, incident_status, action_label, action_url)
  VALUES (coalesce(payload->>'title',''), coalesce(payload->>'content',''), coalesce(payload->>'content_type','markdown'), coalesce(payload->>'delivery_type','notice'),
    coalesce((payload->>'is_active')::boolean,true), nullif(payload->>'start_time','')::timestamptz, nullif(payload->>'end_time','')::timestamptz, auth.uid(),
    coalesce(payload->>'category','general'), coalesce(payload->>'priority','normal'), coalesce((payload->>'is_pinned')::boolean,false), coalesce(payload->>'scope_type','global'), paths,
    coalesce(payload->>'incident_status','none'), nullif(trim(payload->>'action_label'),''), nullif(trim(payload->>'action_url'),'')) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_site_notification(p_id uuid, payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_notice public.site_notifications; paths text[]; start_at timestamptz; end_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden: Admin only'; END IF;
  SELECT * INTO current_notice FROM public.site_notifications WHERE id = p_id AND recipient_user_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Public announcement not found'; END IF;
  IF payload ? 'target_paths' THEN SELECT coalesce(array_agg(value), '{}') INTO paths FROM jsonb_array_elements_text(payload->'target_paths'); ELSE paths := current_notice.target_paths; END IF;
  IF EXISTS (SELECT 1 FROM unnest(paths) AS path WHERE path IS NULL OR path !~ '^/([A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*)?$') THEN RAISE EXCEPTION 'Invalid target page'; END IF;
  start_at := CASE WHEN payload ? 'start_time' THEN nullif(payload->>'start_time','')::timestamptz ELSE current_notice.start_time END;
  end_at := CASE WHEN payload ? 'end_time' THEN nullif(payload->>'end_time','')::timestamptz ELSE current_notice.end_time END;
  IF start_at IS NOT NULL AND end_at IS NOT NULL AND end_at <= start_at THEN RAISE EXCEPTION 'End must follow start'; END IF;
  IF trim(coalesce(payload->>'title',current_notice.title)) = '' AND trim(coalesce(payload->>'content',current_notice.content)) = '' THEN RAISE EXCEPTION 'Title or content required'; END IF;
  UPDATE public.site_notifications SET title = coalesce(payload->>'title',title), content = coalesce(payload->>'content',content),
    content_type = coalesce(payload->>'content_type',content_type), delivery_type = coalesce(payload->>'delivery_type',delivery_type),
    is_active = coalesce((payload->>'is_active')::boolean,is_active), start_time = start_at, end_time = end_at,
    category = coalesce(payload->>'category',category), priority = coalesce(payload->>'priority',priority),
    is_pinned = coalesce((payload->>'is_pinned')::boolean,is_pinned), scope_type = coalesce(payload->>'scope_type',scope_type), target_paths = paths,
    incident_status = coalesce(payload->>'incident_status',incident_status),
    action_label = CASE WHEN payload ? 'action_label' THEN nullif(trim(payload->>'action_label'),'') ELSE action_label END,
    action_url = CASE WHEN payload ? 'action_url' THEN nullif(trim(payload->>'action_url'),'') ELSE action_url END,
    revision = revision + CASE WHEN coalesce((payload->>'notify_again')::boolean,false) THEN 1 ELSE 0 END, updated_at = now()
  WHERE id = p_id;
  IF coalesce((payload->>'notify_again')::boolean,false) THEN DELETE FROM public.notification_dismissals WHERE notification_id = p_id; END IF;
END;
$$;

-- Keep the existing guarded RPC write path; never expose it to unauthenticated callers.
REVOKE ALL ON FUNCTION public.create_site_notification(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_site_notification(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_site_notification(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_site_notification(uuid,jsonb) TO authenticated;

-- Scheduled public announcements must not be readable early via the direct Data API.
DROP POLICY "Users read active notices and own message history" ON public.site_notifications;
CREATE POLICY "Users read published announcements and own messages" ON public.site_notifications FOR SELECT TO authenticated
  USING (recipient_user_id = (select auth.uid()) OR
    (recipient_user_id IS NULL AND is_active = true AND (start_time IS NULL OR start_time <= now())));
