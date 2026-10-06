-- All fixtures roll back; run only after the announcement migration.
BEGIN;
DO $$
DECLARE admin_id uuid; notice_id uuid; scheduled_id uuid; failures integer := 0;
BEGIN
  SELECT id INTO admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'An existing admin profile is required'; END IF;
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  notice_id := public.create_site_notification(jsonb_build_object('title','announcement-test', 'content','Test', 'category','bug', 'priority','urgent', 'delivery_type','banner', 'scope_type','pages', 'target_paths',jsonb_build_array('/schedule'), 'incident_status','investigating', 'action_label','Help', 'action_url','/help'));
  IF NOT EXISTS (SELECT 1 FROM public.site_notifications WHERE id = notice_id AND category = 'bug' AND delivery_type = 'banner' AND target_paths = ARRAY['/schedule']) THEN RAISE EXCEPTION 'Metadata roundtrip failed'; END IF;
  INSERT INTO public.notification_dismissals(notification_id,user_id) VALUES (notice_id,admin_id);
  PERFORM public.update_site_notification(notice_id, '{"title":"ordinary edit"}');
  IF NOT EXISTS (SELECT 1 FROM public.notification_dismissals WHERE notification_id = notice_id) THEN RAISE EXCEPTION 'Ordinary edit erased dismissal'; END IF;
  PERFORM public.update_site_notification(notice_id, '{"incident_status":"resolved","notify_again":true}');
  IF EXISTS (SELECT 1 FROM public.notification_dismissals WHERE notification_id = notice_id) OR NOT EXISTS (SELECT 1 FROM public.site_notifications WHERE id = notice_id AND revision = 2 AND incident_status = 'resolved') THEN RAISE EXCEPTION 'Recovery reminder failed'; END IF;
  BEGIN PERFORM public.create_site_notification('{"title":"bad target","scope_type":"pages","target_paths":["//evil.test"]}'); EXCEPTION WHEN OTHERS THEN failures := failures + 1; END;
  BEGIN PERFORM public.create_site_notification('{"title":"bad link","action_label":"Open","action_url":"javascript:alert(1)"}'); EXCEPTION WHEN OTHERS THEN failures := failures + 1; END;
  BEGIN PERFORM public.create_site_notification('{"title":"bad time","start_time":"2030-10-07T12:00:00Z","end_time":"2030-10-06T12:00:00Z"}'); EXCEPTION WHEN OTHERS THEN failures := failures + 1; END;
  BEGIN PERFORM public.create_site_notification('{"title":"empty target","scope_type":"pages","target_paths":[]}'); EXCEPTION WHEN OTHERS THEN failures := failures + 1; END;
  IF failures <> 4 THEN RAISE EXCEPTION 'Invalid payload validation failed'; END IF;
  scheduled_id := public.create_site_notification(jsonb_build_object('title','announcement-test-scheduled','start_time',now() + interval '1 day'));
  PERFORM set_config('jackyun.test_notice', notice_id::text, true);
  PERFORM set_config('jackyun.test_scheduled', scheduled_id::text, true);
END;
$$;
SELECT set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE failures integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.site_notifications WHERE id = current_setting('jackyun.test_scheduled')::uuid) THEN RAISE EXCEPTION 'Scheduled announcement exposed early'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_notifications WHERE id = current_setting('jackyun.test_notice')::uuid) THEN RAISE EXCEPTION 'Published announcement inaccessible'; END IF;
  BEGIN PERFORM public.create_site_notification('{"title":"Unauthorized"}'); EXCEPTION WHEN OTHERS THEN failures := failures + 1; END;
  BEGIN PERFORM public.update_site_notification(current_setting('jackyun.test_notice')::uuid,'{"title":"Unauthorized"}'); EXCEPTION WHEN OTHERS THEN failures := failures + 1; END;
  IF failures <> 2 THEN RAISE EXCEPTION 'Admin authorization failed'; END IF;
END;
$$;
RESET ROLE;
ROLLBACK;
