-- Keep customer-support notifications as navigation entries to the transcript,
-- instead of duplicating the final answer as a generic inbox message.
ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS ticket_type text NOT NULL DEFAULT 'bug'
    CHECK (ticket_type IN ('bug', 'suspension_appeal', 'deletion_recovery'));

ALTER TABLE public.site_notifications
  ADD COLUMN IF NOT EXISTS related_ticket_id uuid REFERENCES public.bug_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS site_notifications_related_ticket_idx
  ON public.site_notifications(related_ticket_id, created_at DESC)
  WHERE related_ticket_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_add_ticket_message(p_report_id uuid, p_body text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid; report_title text;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF char_length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
  SELECT user_id, title INTO target_user, report_title FROM bug_reports WHERE id = p_report_id AND status <> 'closed' FOR UPDATE;
  IF target_user IS NULL THEN RAISE EXCEPTION 'Ticket is unavailable'; END IF;
  INSERT INTO support_replies(report_id, author_id, body) VALUES (p_report_id, auth.uid(), trim(p_body));
  UPDATE bug_reports SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END, updated_at = now() WHERE id = p_report_id;
  INSERT INTO site_notifications(title, content, content_type, delivery_type, recipient_user_id, related_ticket_id, created_by)
  VALUES ('人工客服有新回复：' || report_title, '客服已回复。点击查看完整对话。', 'markdown', 'message', target_user, p_report_id, auth.uid());
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
  IF old_status = 'closed' THEN RAISE EXCEPTION 'Ticket is already closed'; END IF;
  -- The result is a transcript entry; the inbox item is only its durable entry point.
  INSERT INTO support_replies(report_id, author_id, body) VALUES (p_report_id, auth.uid(), trim(p_result));
  UPDATE bug_reports SET status = 'closed', updated_at = now() WHERE id = p_report_id;
  INSERT INTO bug_report_events(report_id, actor_id, event_type, previous_status, next_status)
  VALUES (p_report_id, auth.uid(), 'status_changed', old_status, 'closed');
  INSERT INTO site_notifications(title, content, content_type, delivery_type, recipient_user_id, related_ticket_id, created_by)
  VALUES ('人工客服咨询已结束：' || report_title, '客服已完成处理。点击查看处理结果与完整对话记录。', 'markdown', 'message', target_user, p_report_id, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_bug_report_status(p_report_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_status text; target_user uuid; report_title text;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_status NOT IN ('open', 'in_progress', 'resolved', 'closed') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  SELECT status, user_id, title INTO old_status, target_user, report_title FROM bug_reports WHERE id = p_report_id FOR UPDATE;
  IF old_status IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF old_status = p_status THEN RETURN; END IF;
  UPDATE bug_reports SET status = p_status, updated_at = now() WHERE id = p_report_id;
  INSERT INTO bug_report_events(report_id, actor_id, event_type, previous_status, next_status)
  VALUES (p_report_id, auth.uid(), 'status_changed', old_status, p_status);
  INSERT INTO site_notifications(title, content, content_type, delivery_type, recipient_user_id, related_ticket_id, created_by)
  VALUES ('人工客服状态更新：' || report_title, '当前状态：' || CASE p_status WHEN 'open' THEN '已提交' WHEN 'in_progress' THEN '处理中' WHEN 'resolved' THEN '已解决' ELSE '已结束' END || '。点击查看对话。', 'markdown', 'message', target_user, p_report_id, auth.uid());
END;
$$;
