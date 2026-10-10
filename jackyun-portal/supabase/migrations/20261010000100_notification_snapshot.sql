-- One statement, caller RLS, and bounded history instead of repeated full inbox reads.
BEGIN;
CREATE FUNCTION public.notification_snapshot(include_history boolean DEFAULT false, page_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH visible AS MATERIALIZED (
    SELECT n.*, d.notification_id IS NOT NULL AS is_read,
      row_number() OVER (PARTITION BY CASE
        WHEN n.delivery_type='message' AND n.recipient_user_id IS NOT NULL
        THEN jsonb_build_array(n.title,n.content,n.recipient_user_id)::text ELSE n.id::text END
        ORDER BY n.created_at DESC,n.id DESC) AS duplicate_rank
    FROM public.site_notifications n
    LEFT JOIN public.notification_dismissals d ON d.notification_id=n.id AND d.user_id=(SELECT auth.uid())
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND (n.recipient_user_id=(SELECT auth.uid()) OR
        (n.recipient_user_id IS NULL AND n.is_active AND (n.start_time IS NULL OR n.start_time<=now())
          AND (include_history OR n.end_time IS NULL OR n.end_time>now())))
  ), selected AS MATERIALIZED (
    SELECT * FROM visible WHERE duplicate_rank=1 AND (include_history OR NOT is_read)
  ), page AS (
    SELECT * FROM selected ORDER BY created_at DESC,id DESC
    LIMIT 100 OFFSET greatest(0,least(page_offset,100000))
  )
  SELECT jsonb_build_object(
    'items',coalesce((SELECT jsonb_agg(to_jsonb(p)-'duplicate_rank' ORDER BY created_at DESC,id DESC) FROM page p),'[]'::jsonb),
    'unreadCount',(SELECT count(*) FROM visible WHERE duplicate_rank=1 AND NOT is_read AND (end_time IS NULL OR end_time>now())),
    'hasMore',(SELECT count(*) FROM selected)>greatest(0,least(page_offset,100000))+100,
    'nextOffset',greatest(0,least(page_offset,100000))+100
  );
$$;
REVOKE ALL ON FUNCTION public.notification_snapshot(boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notification_snapshot(boolean,integer) TO authenticated;
COMMIT;
