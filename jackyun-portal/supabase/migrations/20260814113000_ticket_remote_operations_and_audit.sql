-- Auditable, consent-bound ticket operations. Sensitive values (notably AI keys)
-- are deliberately excluded from both remote assistance and exports.
ALTER TABLE public.support_replies
  ADD COLUMN IF NOT EXISTS system_result text;

CREATE TABLE IF NOT EXISTS public.ticket_operation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_operation_audit_report_created_idx
  ON public.ticket_operation_audit(report_id, created_at DESC);
ALTER TABLE public.ticket_operation_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.admin_request_remote_assistance(p_report_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid; session_id uuid;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT user_id INTO target_user FROM bug_reports WHERE id = p_report_id;
  IF target_user IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  UPDATE remote_assistance_sessions SET status = 'expired' WHERE report_id = p_report_id AND status IN ('requested', 'approved');
  INSERT INTO remote_assistance_sessions(report_id, user_id, admin_id) VALUES (p_report_id, target_user, auth.uid()) RETURNING id INTO session_id;
  INSERT INTO ticket_operation_audit(report_id, actor_id, operation, details) VALUES (p_report_id, auth.uid(), 'remote_assistance_requested', jsonb_build_object('session_id', session_id));
  INSERT INTO site_notifications(title, content, content_type, delivery_type, recipient_user_id, related_ticket_id, created_by) VALUES ('需要你的远程协助授权', '管理员请求查看脱敏配置状态、偏好和诊断日志（不含密码、API Key 或私密内容）。打开客服对话后确认或拒绝。', 'markdown', 'message', target_user, p_report_id, auth.uid());
  RETURN session_id;
END; $$;

CREATE OR REPLACE FUNCTION public.user_respond_remote_assistance(p_session_id uuid, p_approved boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_report uuid;
BEGIN
  UPDATE remote_assistance_sessions SET status = CASE WHEN p_approved THEN 'approved' ELSE 'denied' END, responded_at = now(), expires_at = CASE WHEN p_approved THEN now() + interval '30 minutes' ELSE NULL END
  WHERE id = p_session_id AND user_id = auth.uid() AND status = 'requested' RETURNING report_id INTO target_report;
  IF target_report IS NULL THEN RAISE EXCEPTION 'Authorization request is unavailable'; END IF;
  INSERT INTO ticket_operation_audit(report_id, actor_id, operation, details) VALUES (target_report, auth.uid(), CASE WHEN p_approved THEN 'remote_assistance_approved' ELSE 'remote_assistance_denied' END, jsonb_build_object('expires_at', CASE WHEN p_approved THEN now() + interval '30 minutes' ELSE NULL END));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_remote_assistance_snapshot(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid;
BEGIN
  SELECT user_id INTO target_user FROM remote_assistance_sessions
  WHERE id = p_session_id AND admin_id = auth.uid() AND status = 'approved' AND expires_at > now();
  IF target_user IS NULL OR NOT is_admin_user() THEN RAISE EXCEPTION 'Authorization unavailable'; END IF;
  INSERT INTO ticket_operation_audit(report_id, actor_id, operation, details)
  SELECT report_id, auth.uid(), 'remote_snapshot_viewed', '{"scope":"sanitized_preferences"}'::jsonb
  FROM remote_assistance_sessions WHERE id = p_session_id;
  RETURN jsonb_build_object(
    'preferences', (SELECT jsonb_object_agg(key, value) FROM user_settings WHERE user_id = target_user AND key IN ('language_preference', 'theme_preference', 'sidebar_preferences', 'tts_config')),
    'ai_status', (SELECT jsonb_build_object('configured', COALESCE(value->>'apiKey', '') <> '', 'baseUrl', value->>'baseUrl', 'model', value->>'model') FROM user_settings WHERE user_id = target_user AND key = 'ai_config')
  );
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_remote_preference(p_session_id uuid, p_key text, p_value jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid; target_report uuid; safe_value jsonb;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT user_id, report_id INTO target_user, target_report FROM remote_assistance_sessions
  WHERE id = p_session_id AND admin_id = auth.uid() AND status = 'approved' AND expires_at > now();
  IF target_user IS NULL THEN RAISE EXCEPTION 'Authorization unavailable'; END IF;
  IF p_key = 'language_preference' AND p_value->>'language' IN ('zh', 'en') THEN
    safe_value := jsonb_build_object('language', p_value->>'language');
  ELSIF p_key = 'theme_preference' AND p_value->>'theme' IN ('light', 'gray', 'dark') THEN
    safe_value := jsonb_build_object('theme', p_value->>'theme');
  ELSIF p_key = 'sidebar_preferences' AND p_value->>'musicMode' IN ('player', 'sync') AND p_value->>'answerSheetMode' IN ('standard', 'sync') THEN
    safe_value := jsonb_build_object('musicMode', p_value->>'musicMode', 'answerSheetMode', p_value->>'answerSheetMode');
  ELSE
    RAISE EXCEPTION 'Unsupported preference update';
  END IF;
  INSERT INTO user_settings(user_id, key, value, updated_at) VALUES (target_user, p_key, safe_value, now())
  ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  INSERT INTO ticket_operation_audit(report_id, actor_id, operation, details)
  VALUES (target_report, auth.uid(), 'remote_preference_updated', jsonb_build_object('key', p_key, 'value', safe_value));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_restore_ticket_user_account(p_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT user_id INTO target_user FROM bug_reports WHERE id = p_report_id;
  IF target_user IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  UPDATE profiles SET deleted_at = NULL, updated_at = now() WHERE id = target_user AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This account has no recoverable deleted data'; END IF;
  INSERT INTO ticket_operation_audit(report_id, actor_id, operation, details) VALUES (p_report_id, auth.uid(), 'deleted_account_restored', '{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_export_ticket_user_data(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid; table_name text; rows jsonb; result jsonb := jsonb_build_object('exported_at', now(), 'version', 1, 'tables', '{}'::jsonb);
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT user_id INTO target_user FROM bug_reports WHERE id = p_report_id;
  IF target_user IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  FOREACH table_name IN ARRAY ARRAY['vocab_words', 'vocab_stats', 'vocab_settings', 'study_plans', 'study_tasks', 'study_syllabus', 'study_config', 'study_mock_records', 'poems', 'poem_sessions', 'playlists', 'tracks', 'music_songs', 'music_settings', 'countdowns', 'quiz_subjects', 'quiz_sessions', 'quiz_settings', 'relax_chat', 'relax_state', 'focus_settings', 'focus_tasks', 'focus_sessions', 'legacy_sync_data'] LOOP
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t WHERE user_id = $1', table_name) INTO rows USING target_user;
    result := jsonb_set(result, ARRAY['tables', table_name], rows);
  END LOOP;
  SELECT COALESCE(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO rows FROM quiz_questions q JOIN quiz_sessions s ON s.id = q.session_id WHERE s.user_id = target_user;
  result := jsonb_set(result, ARRAY['tables', 'quiz_questions'], rows);
  SELECT COALESCE(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO rows FROM user_settings s WHERE s.user_id = target_user AND s.key <> 'ai_config';
  result := jsonb_set(result, ARRAY['tables', 'user_settings'], rows);
  INSERT INTO ticket_operation_audit(report_id, actor_id, operation, details) VALUES (p_report_id, auth.uid(), 'user_data_exported', '{"excluded":"ai_config"}'::jsonb);
  RETURN result;
END; $$;

-- A narrow repair: normalize corrupt/obsolete visual preference records only.
CREATE OR REPLACE FUNCTION public.admin_repair_ticket_preferences(p_report_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT user_id INTO target_user FROM bug_reports WHERE id = p_report_id;
  IF target_user IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  INSERT INTO user_settings(user_id, key, value, updated_at) VALUES
    (target_user, 'language_preference', '{"language":"zh"}'::jsonb, now()),
    (target_user, 'theme_preference', '{"theme":"light"}'::jsonb, now()),
    (target_user, 'sidebar_preferences', '{"musicMode":"player","answerSheetMode":"standard"}'::jsonb, now())
  ON CONFLICT (user_id, key) DO UPDATE SET
    value = CASE
      WHEN EXCLUDED.key = 'language_preference' AND user_settings.value->>'language' IN ('zh', 'en') THEN user_settings.value
      WHEN EXCLUDED.key = 'theme_preference' AND user_settings.value->>'theme' IN ('light', 'gray', 'dark') THEN user_settings.value
      WHEN EXCLUDED.key = 'sidebar_preferences' AND user_settings.value->>'musicMode' IN ('player', 'sync') AND user_settings.value->>'answerSheetMode' IN ('standard', 'sync') THEN user_settings.value
      ELSE EXCLUDED.value END,
    updated_at = now();
  INSERT INTO ticket_operation_audit(report_id, actor_id, operation, details) VALUES (p_report_id, auth.uid(), 'visual_preferences_repaired', '{}'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_account_appeal(p_report_id uuid, p_approved boolean, p_response text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_user uuid; appeal_type text; report_title text; old_status text; deletion_time timestamptz; result_label text;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF char_length(trim(p_response)) = 0 THEN RAISE EXCEPTION 'Response cannot be empty'; END IF;
  SELECT user_id, ticket_type, title, status INTO target_user, appeal_type, report_title, old_status FROM bug_reports WHERE id = p_report_id FOR UPDATE;
  IF target_user IS NULL THEN RAISE EXCEPTION 'Appeal not found'; END IF;
  IF appeal_type NOT IN ('suspension_appeal', 'deletion_recovery') THEN RAISE EXCEPTION 'Ticket is not an account appeal'; END IF;
  IF old_status = 'closed' THEN RAISE EXCEPTION 'Appeal is already closed'; END IF;
  IF p_approved AND appeal_type = 'suspension_appeal' THEN
    UPDATE profiles SET account_status = 'active', suspended_reason = NULL, suspended_explanation = NULL, status_updated_at = now(), updated_at = now() WHERE id = target_user;
    result_label := '申诉已批准，账户暂停已解除';
  ELSIF p_approved AND appeal_type = 'deletion_recovery' THEN
    SELECT deleted_at INTO deletion_time FROM profiles WHERE id = target_user FOR UPDATE;
    IF deletion_time IS NULL THEN RAISE EXCEPTION 'Account is not pending deletion'; END IF;
    IF deletion_time < now() - interval '30 days' THEN RAISE EXCEPTION 'The 30-day recovery period has expired'; END IF;
    UPDATE profiles SET deleted_at = NULL, updated_at = now() WHERE id = target_user;
    result_label := '申诉已批准，账户与保留数据已恢复';
  ELSE
    result_label := '申诉未获批准，原账户状态保持不变';
  END IF;
  INSERT INTO support_replies(report_id, author_id, body, message_kind, system_result) VALUES (p_report_id, auth.uid(), trim(p_response), 'resolution', result_label);
  UPDATE bug_reports SET status = 'closed', updated_at = now() WHERE id = p_report_id;
  INSERT INTO bug_report_events(report_id, actor_id, event_type, previous_status, next_status) VALUES (p_report_id, auth.uid(), 'status_changed', old_status, 'closed');
  INSERT INTO site_notifications(title, content, content_type, delivery_type, recipient_user_id, created_by, related_ticket_id) VALUES ('账户申诉处理完成：' || report_title, result_label || E'\n\n管理员说明：' || trim(p_response), 'markdown', 'message', target_user, auth.uid(), p_report_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_bug_report_details(p_report_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT jsonb_build_object(
    'user', (SELECT jsonb_build_object('id', p.id, 'email', p.email, 'display_name', p.display_name, 'avatar_url', p.avatar_url, 'created_at', p.created_at, 'account_status', p.account_status, 'deleted_at', p.deleted_at, 'suspended_reason', p.suspended_reason, 'suspended_explanation', p.suspended_explanation) FROM profiles p JOIN bug_reports b ON b.user_id = p.id WHERE b.id = p_report_id),
    'messages', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'body', r.body, 'author_id', r.author_id, 'is_admin', p.role = 'admin', 'author_name', COALESCE(p.display_name, p.email, '用户'), 'message_kind', r.message_kind, 'system_result', r.system_result, 'created_at', r.created_at, 'updated_at', r.updated_at) ORDER BY r.created_at) FROM support_replies r LEFT JOIN profiles p ON p.id = r.author_id WHERE r.report_id = p_report_id), '[]'::jsonb),
    'notes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'author_id', n.author_id, 'created_at', n.created_at) ORDER BY n.created_at) FROM bug_report_internal_notes n WHERE n.report_id = p_report_id), '[]'::jsonb),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type, 'previous_status', e.previous_status, 'next_status', e.next_status, 'created_at', e.created_at) ORDER BY e.created_at) FROM bug_report_events e WHERE e.report_id = p_report_id), '[]'::jsonb),
    'operation_audit', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'operation', a.operation, 'details', a.details, 'created_at', a.created_at) ORDER BY a.created_at DESC) FROM ticket_operation_audit a WHERE a.report_id = p_report_id), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_update_remote_preference(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_ticket_user_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_repair_ticket_preferences(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_export_ticket_user_data(uuid) TO authenticated;
