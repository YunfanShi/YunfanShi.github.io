-- Two-way ticket conversation. The report owner can read all conversation rows
-- for their own report; only the author can edit their own message.
ALTER TABLE public.support_replies ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP POLICY IF EXISTS "Users write own support replies" ON public.support_replies;
CREATE POLICY "Users create messages on own open tickets" ON public.support_replies FOR INSERT TO authenticated
  WITH CHECK (author_id = (select auth.uid()) AND EXISTS (
    SELECT 1 FROM public.bug_reports b WHERE b.id = report_id AND b.user_id = (select auth.uid()) AND b.status <> 'closed'
  ));
CREATE POLICY "Users edit own ticket messages" ON public.support_replies FOR UPDATE TO authenticated
  USING (author_id = (select auth.uid()) AND EXISTS (
    SELECT 1 FROM public.bug_reports b WHERE b.id = report_id AND b.user_id = (select auth.uid()) AND b.status <> 'closed'
  )) WITH CHECK (author_id = (select auth.uid()));

-- Retain addressed support messages in a user's notification history even after
-- a global notification has expired or been disabled. Dismissal remains per-user.
DROP POLICY IF EXISTS "Users read active public or addressed notifications" ON public.site_notifications;
CREATE POLICY "Users read active notices and own message history" ON public.site_notifications FOR SELECT TO authenticated
  USING ((recipient_user_id = (select auth.uid())) OR (recipient_user_id IS NULL AND is_active = true));

CREATE OR REPLACE FUNCTION public.admin_list_bug_report_details(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT jsonb_build_object(
    'user', (SELECT jsonb_build_object('id', p.id, 'email', p.email, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'created_at', p.created_at, 'account_status', p.account_status) FROM profiles p JOIN bug_reports b ON b.user_id = p.id WHERE b.id = p_report_id),
    'messages', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'body', r.body, 'author_id', r.author_id, 'is_admin', p.role = 'admin', 'author_name', COALESCE(p.display_name, p.email, '用户'), 'created_at', r.created_at, 'updated_at', r.updated_at) ORDER BY r.created_at) FROM support_replies r LEFT JOIN profiles p ON p.id = r.author_id WHERE r.report_id = p_report_id), '[]'::jsonb),
    'notes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'author_id', n.author_id, 'created_at', n.created_at) ORDER BY n.created_at) FROM bug_report_internal_notes n WHERE n.report_id = p_report_id), '[]'::jsonb),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type, 'previous_status', e.previous_status, 'next_status', e.next_status, 'created_at', e.created_at) ORDER BY e.created_at) FROM bug_report_events e WHERE e.report_id = p_report_id), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_ticket_message(p_report_id uuid, p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF char_length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
  IF NOT EXISTS (SELECT 1 FROM bug_reports WHERE id = p_report_id AND status <> 'closed') THEN RAISE EXCEPTION 'Ticket is unavailable'; END IF;
  INSERT INTO support_replies(report_id, author_id, body) VALUES (p_report_id, auth.uid(), trim(p_body));
  UPDATE bug_reports SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END, updated_at = now() WHERE id = p_report_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_edit_ticket_message(p_message_id uuid, p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF char_length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
  UPDATE support_replies SET body = trim(p_body), updated_at = now() WHERE id = p_message_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Message not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_close_bug_report(p_report_id uuid, p_result text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid; report_title text; old_status text;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF char_length(trim(p_result)) = 0 THEN RAISE EXCEPTION 'Resolution cannot be empty'; END IF;
  SELECT user_id, title, status INTO target_user, report_title, old_status FROM bug_reports WHERE id = p_report_id FOR UPDATE;
  IF target_user IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  INSERT INTO support_replies(report_id, author_id, body) VALUES (p_report_id, auth.uid(), trim(p_result));
  INSERT INTO site_notifications(title, content, content_type, delivery_type, recipient_user_id, created_by)
  VALUES ('工单已结束：' || report_title, trim(p_result), 'markdown', 'message', target_user, auth.uid());
  UPDATE bug_reports SET status = 'closed', updated_at = now() WHERE id = p_report_id;
  INSERT INTO bug_report_events(report_id, actor_id, event_type, previous_status, next_status) VALUES (p_report_id, auth.uid(), 'status_changed', old_status, 'closed');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_bug_report(p_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  DELETE FROM bug_reports WHERE id = p_report_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_ticket_message(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_edit_ticket_message(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_close_bug_report(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_bug_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_ticket_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_edit_ticket_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_close_bug_report(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_bug_report(uuid) TO authenticated;
