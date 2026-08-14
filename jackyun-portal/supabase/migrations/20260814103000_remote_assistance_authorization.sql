CREATE TABLE IF NOT EXISTS public.remote_assistance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'denied', 'revoked', 'expired')),
  scope jsonb NOT NULL DEFAULT '{"preferences":true,"ai_status":true,"diagnostics":true}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
ALTER TABLE public.remote_assistance_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own remote assistance" ON public.remote_assistance_sessions FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_request_remote_assistance(p_report_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid; session_id uuid;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT user_id INTO target_user FROM bug_reports WHERE id = p_report_id;
  IF target_user IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  UPDATE remote_assistance_sessions SET status = 'expired' WHERE report_id = p_report_id AND status IN ('requested', 'approved');
  INSERT INTO remote_assistance_sessions(report_id, user_id, admin_id) VALUES (p_report_id, target_user, auth.uid()) RETURNING id INTO session_id;
  INSERT INTO site_notifications(title, content, content_type, delivery_type, recipient_user_id, related_ticket_id, created_by) VALUES ('需要你的远程协助授权', '管理员请求查看脱敏配置状态、偏好和诊断日志（不含密码、API Key 或私密内容）。打开客服对话后确认或拒绝。', 'markdown', 'message', target_user, p_report_id, auth.uid());
  RETURN session_id;
END; $$;

CREATE OR REPLACE FUNCTION public.user_respond_remote_assistance(p_session_id uuid, p_approved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE remote_assistance_sessions SET status = CASE WHEN p_approved THEN 'approved' ELSE 'denied' END, responded_at = now(), expires_at = CASE WHEN p_approved THEN now() + interval '30 minutes' ELSE NULL END WHERE id = p_session_id AND user_id = auth.uid() AND status = 'requested';
  IF NOT FOUND THEN RAISE EXCEPTION 'Authorization request is unavailable'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_remote_assistance_snapshot(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid;
BEGIN
  SELECT user_id INTO target_user FROM remote_assistance_sessions WHERE id = p_session_id AND admin_id = auth.uid() AND status = 'approved' AND expires_at > now();
  IF target_user IS NULL OR NOT is_admin_user() THEN RAISE EXCEPTION 'Authorization unavailable'; END IF;
  RETURN jsonb_build_object('preferences', (SELECT jsonb_object_agg(key, value) FROM user_settings WHERE user_id = target_user AND key IN ('language_preference', 'sidebar_preferences', 'tts_config')), 'ai_status', (SELECT jsonb_build_object('configured', COALESCE(value->>'apiKey', '') <> '', 'baseUrl', value->>'baseUrl', 'model', value->>'model') FROM user_settings WHERE user_id = target_user AND key = 'ai_config'));
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_request_remote_assistance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_respond_remote_assistance(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_remote_assistance_snapshot(uuid) TO authenticated;
