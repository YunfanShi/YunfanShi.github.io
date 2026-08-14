CREATE TABLE IF NOT EXISTS public.bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 160), description text NOT NULL,
  page_url text, severity text NOT NULL DEFAULT 'normal' CHECK (severity IN ('low', 'normal', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.support_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES public.bug_reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_notifications ADD COLUMN IF NOT EXISTS recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
DROP POLICY IF EXISTS "Anyone can read active notifications" ON public.site_notifications;
CREATE POLICY "Users read active public or addressed notifications" ON public.site_notifications FOR SELECT TO authenticated USING (is_active = true AND (recipient_user_id IS NULL OR recipient_user_id = (select auth.uid())));
CREATE INDEX IF NOT EXISTS bug_reports_status_idx ON public.bug_reports(status, created_at DESC);
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY; ALTER TABLE public.support_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bug reports" ON public.bug_reports FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users read own support replies" ON public.support_replies FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM bug_reports b WHERE b.id = report_id AND b.user_id = (select auth.uid())));
CREATE POLICY "Users write own support replies" ON public.support_replies FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM bug_reports b WHERE b.id = report_id AND b.user_id = (select auth.uid())) AND author_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_list_bug_reports()
RETURNS SETOF bug_reports LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT * FROM bug_reports WHERE is_admin_user() ORDER BY updated_at DESC; $$;
CREATE OR REPLACE FUNCTION public.admin_reply_bug_report(p_report_id uuid, p_body text, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE target_user uuid; report_title text; BEGIN IF NOT is_admin_user() THEN RAISE EXCEPTION 'Forbidden'; END IF; SELECT user_id, title INTO target_user, report_title FROM bug_reports WHERE id = p_report_id; IF target_user IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF; INSERT INTO support_replies(report_id, author_id, body) VALUES (p_report_id, auth.uid(), p_body); INSERT INTO site_notifications(title, content, content_type, delivery_type, recipient_user_id, created_by) VALUES ('Bug 反馈回复：' || report_title, p_body, 'markdown', 'message', target_user, auth.uid()); UPDATE bug_reports SET status = p_status, updated_at = now() WHERE id = p_report_id; END; $$;
GRANT EXECUTE ON FUNCTION public.admin_list_bug_reports() TO authenticated; GRANT EXECUTE ON FUNCTION public.admin_reply_bug_report(uuid, text, text) TO authenticated;
