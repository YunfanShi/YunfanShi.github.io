-- Slice large records inside Postgres so each HTTP part transfers only its own bytes.
-- SECURITY INVOKER preserves existing RLS; callers cannot choose another user.
create or replace function public.get_web_sync_record_part(
  p_storage_key text, p_revision bigint, p_part integer
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_bytes bytea;
  v_count integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;
  if p_part is null or p_part < 0 or p_part >= 400
     or p_revision is null or p_revision < 1 then
    return jsonb_build_object('error', 'INVALID_PART');
  end if;
  select convert_to(case when d.deleted_at is not null then 'null'
                        else coalesce(d.storage_value::text, 'null') end, 'UTF8')
    into v_bytes
    from public.legacy_sync_data d
    where d.user_id = auth.uid() and d.storage_key = p_storage_key and d.revision = p_revision;
  if not found then
    return jsonb_build_object('error', 'REVISION_CHANGED');
  end if;
  if octet_length(v_bytes) > 24000000 then
    return jsonb_build_object('error', 'PAYLOAD_TOO_LARGE');
  end if;
  v_count := (octet_length(v_bytes) + 59999) / 60000;
  if p_part >= v_count then
    return jsonb_build_object('error', 'INVALID_PART');
  end if;
  return jsonb_build_object(
    'revision', p_revision, 'part', p_part, 'count', v_count,
    'data', replace(encode(substring(v_bytes from p_part * 60000 + 1 for 60000), 'base64'), E'\n', '')
  );
end;
$$;

-- Large values are withheld before crossing the database network boundary.
-- The byte limit is conservative relative to the browser's 400k UTF-16 limit.
create or replace function public.list_web_sync_records(
  p_cursor timestamptz default null, p_storage_key text default null
) returns table (
  storage_key text, storage_value jsonb, revision bigint, content_hash text,
  deleted_at timestamptz, updated_at timestamptz, client_updated_at timestamptz, large boolean
)
language sql stable security invoker set search_path = ''
as $$
  select d.storage_key,
    case when d.deleted_at is not null or octet_length(d.storage_value::text) > 400000
         then null else d.storage_value end,
    d.revision, d.content_hash, d.deleted_at, d.updated_at, d.client_updated_at,
    d.deleted_at is null and octet_length(d.storage_value::text) > 400000
  from public.legacy_sync_data d
  where d.user_id = (select auth.uid())
    and (p_storage_key is null or d.storage_key = p_storage_key)
    and (p_storage_key is not null or p_cursor is null or d.updated_at > p_cursor)
  order by d.updated_at, d.id
  limit 500;
$$;

revoke all on function public.get_web_sync_record_part(text, bigint, integer) from public, anon;
revoke all on function public.list_web_sync_records(timestamptz, text) from public, anon;
grant execute on function public.get_web_sync_record_part(text, bigint, integer) to authenticated;
grant execute on function public.list_web_sync_records(timestamptz, text) to authenticated;
notify pgrst, 'reload schema';
