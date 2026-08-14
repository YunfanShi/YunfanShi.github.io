-- Notices are delivered as both a modal and inbox item; messages only live in inbox.
ALTER TABLE public.site_notifications
  ADD COLUMN IF NOT EXISTS delivery_type text NOT NULL DEFAULT 'notice'
  CHECK (delivery_type IN ('notice', 'message'));

CREATE INDEX IF NOT EXISTS site_notifications_delivery_idx
  ON public.site_notifications(delivery_type, is_active, created_at DESC);

CREATE OR REPLACE FUNCTION create_site_notification(payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden: Admin only'; END IF;
  INSERT INTO site_notifications (title, content, content_type, delivery_type, is_active, start_time, end_time, created_by)
  VALUES (COALESCE(payload->>'title', ''), COALESCE(payload->>'content', ''), COALESCE(payload->>'content_type', 'markdown'),
    CASE WHEN payload->>'delivery_type' IN ('notice', 'message') THEN payload->>'delivery_type' ELSE 'notice' END,
    COALESCE((payload->>'is_active')::boolean, true), NULLIF(payload->>'start_time', '')::timestamptz,
    NULLIF(payload->>'end_time', '')::timestamptz, auth.uid()) RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_site_notification(p_id uuid, payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden: Admin only'; END IF;
  UPDATE site_notifications SET title = COALESCE(payload->>'title', title), content = COALESCE(payload->>'content', content),
    content_type = COALESCE(payload->>'content_type', content_type),
    delivery_type = CASE WHEN payload ? 'delivery_type' AND payload->>'delivery_type' IN ('notice', 'message') THEN payload->>'delivery_type' ELSE delivery_type END,
    is_active = COALESCE((payload->>'is_active')::boolean, is_active),
    start_time = CASE WHEN payload ? 'start_time' THEN NULLIF(payload->>'start_time', '')::timestamptz ELSE start_time END,
    end_time = CASE WHEN payload ? 'end_time' THEN NULLIF(payload->>'end_time', '')::timestamptz ELSE end_time END, updated_at = now()
  WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notification not found'; END IF;
END;
$$;
