-- Account restriction notices, account appeals, and notification-linked support chats.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspended_explanation text;

ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS ticket_type text NOT NULL DEFAULT 'bug'
    CHECK (ticket_type IN ('bug', 'suspension_appeal', 'deletion_recovery'));

ALTER TABLE public.site_notifications
  ADD COLUMN IF NOT EXISTS related_ticket_id uuid
    REFERENCES public.bug_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bug_reports_user_type_status_idx
  ON public.bug_reports(user_id, ticket_type, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS site_notifications_related_ticket_idx
  ON public.site_notifications(related_ticket_id)
  WHERE related_ticket_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.admin_list_users();
CREATE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id uuid, email text, display_name text, avatar_url text, role text,
  account_status text, suspended_reason text, suspended_explanation text,
  created_at timestamptz, updated_at timestamptz, deleted_at timestamptz,
  focus_sessions bigint, legacy_records bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.email, p.display_name, p.avatar_url, p.role,
    p.account_status, p.suspended_reason, p.suspended_explanation,
    p.created_at, p.updated_at, p.deleted_at,
    (SELECT count(*) FROM focus_sessions fs WHERE fs.user_id = p.id),
    (SELECT count(*) FROM legacy_sync_data ls WHERE ls.user_id = p.id)
  FROM profiles p
  WHERE is_admin_user()
  ORDER BY p.created_at DESC;
$$;

DROP FUNCTION IF EXISTS public.admin_set_account_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.admin_set_account_status(uuid, text, text, text);
CREATE FUNCTION public.admin_set_account_status(
  target_id uuid,
  next_status text,
  reason text DEFAULT NULL,
  explanation text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden: Admin only'; END IF;
  IF target_id = auth.uid() THEN RAISE EXCEPTION 'Administrators cannot change their own account status'; END IF;
  IF next_status NOT IN ('active', 'suspended') THEN RAISE EXCEPTION 'Invalid account status'; END IF;
  IF next_status = 'suspended' AND char_length(trim(COALESCE(reason, ''))) = 0 THEN
    RAISE EXCEPTION 'Suspension reason is required';
  END IF;

  UPDATE profiles SET
    account_status = next_status,
    suspended_reason = CASE WHEN next_status = 'suspended' THEN trim(reason) ELSE NULL END,
    suspended_explanation = CASE WHEN next_status = 'suspended' THEN NULLIF(trim(explanation), '') ELSE NULL END,
    status_updated_at = now(),
    updated_at = now()
  WHERE id = target_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_bug_report_details(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT jsonb_build_object(
    'user', (
      SELECT jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'created_at', p.created_at,
        'account_status', p.account_status,
        'deleted_at', p.deleted_at,
        'suspended_reason', p.suspended_reason,
        'suspended_explanation', p.suspended_explanation
      )
      FROM profiles p
      JOIN bug_reports b ON b.user_id = p.id
      WHERE b.id = p_report_id
    ),
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'body', r.body,
        'author_id', r.author_id,
        'is_admin', p.role = 'admin',
        'author_name', COALESCE(p.display_name, p.email, '用户'),
        'created_at', r.created_at,
        'updated_at', r.updated_at
      ) ORDER BY r.created_at)
      FROM support_replies r
      LEFT JOIN profiles p ON p.id = r.author_id
      WHERE r.report_id = p_report_id
    ), '[]'::jsonb),
    'notes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'author_id', n.author_id, 'created_at', n.created_at
      ) ORDER BY n.created_at)
      FROM bug_report_internal_notes n WHERE n.report_id = p_report_id
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'previous_status', e.previous_status,
        'next_status', e.next_status,
        'created_at', e.created_at
      ) ORDER BY e.created_at)
      FROM bug_report_events e WHERE e.report_id = p_report_id
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_ticket_message(p_report_id uuid, p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid; report_title text;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF char_length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
  SELECT user_id, title INTO target_user, report_title
  FROM bug_reports WHERE id = p_report_id AND status <> 'closed';
  IF target_user IS NULL THEN RAISE EXCEPTION 'Ticket is unavailable'; END IF;

  INSERT INTO support_replies(report_id, author_id, body)
  VALUES (p_report_id, auth.uid(), trim(p_body));
  INSERT INTO site_notifications(
    title, content, content_type, delivery_type,
    recipient_user_id, created_by, related_ticket_id
  ) VALUES (
    '客服回复：' || report_title,
    trim(p_body),
    'markdown',
    'message',
    target_user,
    auth.uid(),
    p_report_id
  );
  UPDATE bug_reports SET
    status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
    updated_at = now()
  WHERE id = p_report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_close_bug_report(p_report_id uuid, p_result text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid; report_title text; old_status text;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF char_length(trim(p_result)) = 0 THEN RAISE EXCEPTION 'Resolution cannot be empty'; END IF;
  SELECT user_id, title, status INTO target_user, report_title, old_status
  FROM bug_reports WHERE id = p_report_id FOR UPDATE;
  IF target_user IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  INSERT INTO support_replies(report_id, author_id, body)
  VALUES (p_report_id, auth.uid(), trim(p_result));
  INSERT INTO site_notifications(
    title, content, content_type, delivery_type,
    recipient_user_id, created_by, related_ticket_id
  ) VALUES (
    '工单已结束：' || report_title,
    trim(p_result),
    'markdown',
    'message',
    target_user,
    auth.uid(),
    p_report_id
  );
  UPDATE bug_reports SET status = 'closed', updated_at = now() WHERE id = p_report_id;
  INSERT INTO bug_report_events(report_id, actor_id, event_type, previous_status, next_status)
  VALUES (p_report_id, auth.uid(), 'status_changed', old_status, 'closed');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_account_appeal(
  p_report_id uuid,
  p_approved boolean,
  p_response text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_user uuid;
  appeal_type text;
  report_title text;
  old_status text;
  deletion_time timestamptz;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF char_length(trim(p_response)) = 0 THEN RAISE EXCEPTION 'Response cannot be empty'; END IF;

  SELECT user_id, ticket_type, title, status
  INTO target_user, appeal_type, report_title, old_status
  FROM bug_reports WHERE id = p_report_id FOR UPDATE;

  IF target_user IS NULL THEN RAISE EXCEPTION 'Appeal not found'; END IF;
  IF appeal_type NOT IN ('suspension_appeal', 'deletion_recovery') THEN
    RAISE EXCEPTION 'Ticket is not an account appeal';
  END IF;
  IF old_status = 'closed' THEN RAISE EXCEPTION 'Appeal is already closed'; END IF;

  IF p_approved AND appeal_type = 'suspension_appeal' THEN
    UPDATE profiles SET
      account_status = 'active',
      suspended_reason = NULL,
      suspended_explanation = NULL,
      status_updated_at = now(),
      updated_at = now()
    WHERE id = target_user;
  ELSIF p_approved AND appeal_type = 'deletion_recovery' THEN
    SELECT deleted_at INTO deletion_time FROM profiles WHERE id = target_user FOR UPDATE;
    IF deletion_time IS NULL THEN RAISE EXCEPTION 'Account is not pending deletion'; END IF;
    IF deletion_time < now() - interval '30 days' THEN
      RAISE EXCEPTION 'The 30-day recovery period has expired';
    END IF;
    UPDATE profiles SET deleted_at = NULL, updated_at = now() WHERE id = target_user;
  END IF;

  INSERT INTO support_replies(report_id, author_id, body)
  VALUES (p_report_id, auth.uid(), trim(p_response));
  UPDATE bug_reports SET status = 'closed', updated_at = now() WHERE id = p_report_id;
  INSERT INTO bug_report_events(report_id, actor_id, event_type, previous_status, next_status)
  VALUES (p_report_id, auth.uid(), 'status_changed', old_status, 'closed');
  INSERT INTO site_notifications(
    title, content, content_type, delivery_type,
    recipient_user_id, created_by, related_ticket_id
  ) VALUES (
    CASE WHEN p_approved THEN '账户申诉已通过：' ELSE '账户申诉处理结果：' END || report_title,
    trim(p_response),
    'markdown',
    'message',
    target_user,
    auth.uid(),
    p_report_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_account_status(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_bug_report_details(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_add_ticket_message(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_close_bug_report(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_resolve_account_appeal(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_account_status(uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_bug_report_details(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_add_ticket_message(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_close_bug_report(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_resolve_account_appeal(uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_account_status(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_bug_report_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_ticket_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_close_bug_report(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_account_appeal(uuid, boolean, text) TO authenticated;
