-- A report can only be resolved once. This prevents double-clicks/retries from
-- inserting multiple identical support replies and inbox messages.
CREATE OR REPLACE FUNCTION public.admin_reply_bug_report(p_report_id uuid, p_body text, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid;
  report_title text;
  current_status text;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT user_id, title, status INTO target_user, report_title, current_status
  FROM bug_reports WHERE id = p_report_id FOR UPDATE;
  IF target_user IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF current_status IN ('resolved', 'closed') THEN RAISE EXCEPTION 'This report has already been resolved'; END IF;
  IF char_length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'Reply cannot be empty'; END IF;
  INSERT INTO support_replies(report_id, author_id, body) VALUES (p_report_id, auth.uid(), trim(p_body));
  INSERT INTO site_notifications(title, content, content_type, delivery_type, recipient_user_id, created_by)
  VALUES ('Bug 反馈回复：' || report_title, trim(p_body), 'markdown', 'message', target_user, auth.uid());
  UPDATE bug_reports SET status = p_status, updated_at = now() WHERE id = p_report_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reply_bug_report(uuid, text, text) TO authenticated;
