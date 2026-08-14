-- Operations centre: private ticket notes/events and admin-only dashboard aggregates.

CREATE TABLE IF NOT EXISTS public.bug_report_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bug_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('status_changed', 'internal_note')),
  previous_status text,
  next_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bug_report_internal_notes_report_idx ON public.bug_report_internal_notes(report_id, created_at);
CREATE INDEX IF NOT EXISTS bug_report_events_report_idx ON public.bug_report_events(report_id, created_at);

ALTER TABLE public.bug_report_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bug_report_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_list_bug_report_details(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT jsonb_build_object(
    'replies', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'body', r.body, 'author_id', r.author_id, 'created_at', r.created_at) ORDER BY r.created_at) FROM support_replies r WHERE r.report_id = p_report_id), '[]'::jsonb),
    'notes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'author_id', n.author_id, 'created_at', n.created_at) ORDER BY n.created_at) FROM bug_report_internal_notes n WHERE n.report_id = p_report_id), '[]'::jsonb),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type, 'previous_status', e.previous_status, 'next_status', e.next_status, 'created_at', e.created_at) ORDER BY e.created_at) FROM bug_report_events e WHERE e.report_id = p_report_id), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_bug_report_status(p_report_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_status text;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  SELECT status INTO old_status FROM bug_reports WHERE id = p_report_id FOR UPDATE;
  IF old_status IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF old_status = p_status THEN RETURN; END IF;
  UPDATE bug_reports SET status = p_status, updated_at = now() WHERE id = p_report_id;
  INSERT INTO bug_report_events(report_id, actor_id, event_type, previous_status, next_status)
  VALUES (p_report_id, auth.uid(), 'status_changed', old_status, p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_bug_report_note(p_report_id uuid, p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF NOT EXISTS (SELECT 1 FROM bug_reports WHERE id = p_report_id) THEN RAISE EXCEPTION 'Report not found'; END IF;
  INSERT INTO bug_report_internal_notes(report_id, author_id, body) VALUES (p_report_id, auth.uid(), trim(p_body));
  INSERT INTO bug_report_events(report_id, actor_id, event_type) VALUES (p_report_id, auth.uid(), 'internal_note');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reply_bug_report(p_report_id uuid, p_body text, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid; report_title text; old_status text;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF char_length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'Reply cannot be empty'; END IF;
  SELECT user_id, title, status INTO target_user, report_title, old_status FROM bug_reports WHERE id = p_report_id FOR UPDATE;
  IF target_user IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  INSERT INTO support_replies(report_id, author_id, body) VALUES (p_report_id, auth.uid(), trim(p_body));
  INSERT INTO site_notifications(title, content, content_type, delivery_type, recipient_user_id, created_by)
  VALUES ('Bug 反馈回复：' || report_title, trim(p_body), 'markdown', 'message', target_user, auth.uid());
  UPDATE bug_reports SET status = p_status, updated_at = now() WHERE id = p_report_id;
  IF old_status <> p_status THEN
    INSERT INTO bug_report_events(report_id, actor_id, event_type, previous_status, next_status)
    VALUES (p_report_id, auth.uid(), 'status_changed', old_status, p_status);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_overview(p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE days integer := CASE WHEN p_days = 7 THEN 7 ELSE 30 END;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN jsonb_build_object(
    'metrics', jsonb_build_object(
      'total_users', (SELECT count(*) FROM profiles),
      'new_users', (SELECT count(*) FROM profiles WHERE created_at >= now() - make_interval(days => days)),
      'active_notifications', (SELECT count(*) FROM site_notifications WHERE is_active AND (start_time IS NULL OR start_time <= now()) AND (end_time IS NULL OR end_time >= now())),
      'open_reports', (SELECT count(*) FROM bug_reports WHERE status IN ('open', 'in_progress')),
      'restricted_accounts', (SELECT count(*) FROM profiles WHERE account_status = 'suspended' OR deleted_at IS NOT NULL)
    ),
    'trends', jsonb_build_object(
      'users', (SELECT COALESCE(jsonb_agg(jsonb_build_object('date', day::date, 'value', COALESCE(counts.value, 0)) ORDER BY day), '[]'::jsonb) FROM generate_series(current_date - (days - 1), current_date, interval '1 day') day LEFT JOIN (SELECT created_at::date AS date, count(*) AS value FROM profiles WHERE created_at >= current_date - (days - 1) GROUP BY 1) counts ON counts.date = day::date),
      'reports', (SELECT COALESCE(jsonb_agg(jsonb_build_object('date', day::date, 'value', COALESCE(counts.value, 0)) ORDER BY day), '[]'::jsonb) FROM generate_series(current_date - (days - 1), current_date, interval '1 day') day LEFT JOIN (SELECT created_at::date AS date, count(*) AS value FROM bug_reports WHERE created_at >= current_date - (days - 1) GROUP BY 1) counts ON counts.date = day::date),
      'focus_minutes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('date', day::date, 'value', COALESCE(counts.value, 0)) ORDER BY day), '[]'::jsonb) FROM generate_series(current_date - (days - 1), current_date, interval '1 day') day LEFT JOIN (SELECT completed_at::date AS date, round(sum(duration_seconds) / 60.0)::integer AS value FROM focus_sessions WHERE completed_at >= current_date - (days - 1) GROUP BY 1) counts ON counts.date = day::date)
    ),
    'todos', jsonb_build_object(
      'reports', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'severity', severity, 'status', status, 'created_at', created_at) ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END, created_at DESC) FROM (SELECT * FROM bug_reports WHERE status IN ('open', 'in_progress') ORDER BY created_at DESC LIMIT 5) items), '[]'::jsonb),
      'accounts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'display_name', display_name, 'email', email, 'account_status', account_status, 'deleted_at', deleted_at)) FROM (SELECT * FROM profiles WHERE account_status = 'suspended' OR deleted_at IS NOT NULL ORDER BY updated_at DESC LIMIT 5) items), '[]'::jsonb),
      'notifications', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'start_time', start_time, 'end_time', end_time, 'is_active', is_active)) FROM (SELECT * FROM site_notifications WHERE (start_time BETWEEN now() AND now() + interval '7 days') OR (end_time BETWEEN now() - interval '1 day' AND now() + interval '7 days') ORDER BY COALESCE(start_time, end_time) LIMIT 5) items), '[]'::jsonb)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_bug_report_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_bug_report_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_bug_report_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_overview(integer) TO authenticated;
