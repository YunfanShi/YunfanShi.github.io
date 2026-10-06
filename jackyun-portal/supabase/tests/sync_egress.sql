-- Run with the migration installed. All fixtures and claims roll back.
begin;
select set_config('jackyun.test_user', (select id::text from auth.users order by id limit 1), true);
select set_config('jackyun.other_user', (select id::text from auth.users order by id offset 1 limit 1), true);
select set_config('jackyun.test_key', 'egress_test_' || gen_random_uuid()::text, true);
insert into public.legacy_sync_data (user_id, storage_key, storage_value, revision)
values
(current_setting('jackyun.test_user')::uuid, current_setting('jackyun.test_key'),
 jsonb_build_object('text', repeat('学习📚', 150000)), 42),
(current_setting('jackyun.other_user')::uuid, current_setting('jackyun.test_key'),
 '{"other_user":true}'::jsonb, 43),
(current_setting('jackyun.test_user')::uuid, current_setting('jackyun.test_key') || '_small',
 '{"text":"学习📚","number":42}'::jsonb, 1);
select set_config('request.jwt.claim.sub', current_setting('jackyun.test_user'), true);
set local role authenticated;
do $test$
declare
  v_key text := current_setting('jackyun.test_key');
  v_chunk jsonb;
  v_reassembled text;
  v_expected jsonb;
  v_parts integer;
  v_meta record;
begin
  v_chunk := public.get_web_sync_record_part(v_key, 42, 0);
  v_parts := (v_chunk->>'count')::integer;
  assert v_parts > 20, 'Fixture must span many parts';
  assert octet_length(decode(v_chunk->>'data', 'base64')) = 60000, 'Only one part crosses the network';
  select convert_from(string_agg(decode(public.get_web_sync_record_part(v_key, 42, n)->>'data', 'base64'), ''::bytea order by n), 'UTF8')
    into v_reassembled from generate_series(0, v_parts - 1) n;
  select storage_value into v_expected from public.legacy_sync_data where storage_key = v_key;
  assert v_reassembled::jsonb = v_expected, 'Unicode must round-trip across byte boundaries';
  select * into v_meta from public.list_web_sync_records(null, v_key);
  assert v_meta.large and v_meta.storage_value is null and v_meta.revision = 42, 'Large list values must be withheld';
  select * into v_meta from public.list_web_sync_records(null, v_key || '_small');
  assert not v_meta.large and v_meta.storage_value->>'text' = '学习📚', 'Small records must remain inline';
  assert not exists(select 1 from public.list_web_sync_records(now() + interval '1 day', null)), 'Cursor must filter unchanged records';
  assert public.get_web_sync_record_part(v_key, 41, 0)->>'error' = 'REVISION_CHANGED', 'Stale revision must be rejected';
  assert public.get_web_sync_record_part(v_key, 43, 0)->>'error' = 'REVISION_CHANGED', 'Another user revision must not be accessible';
  assert public.get_web_sync_record_part(v_key, 42, v_parts)->>'error' = 'INVALID_PART', 'Out of range must be rejected';
  assert public.get_web_sync_record_part(v_key, 42, -1)->>'error' = 'INVALID_PART', 'Negative part must be rejected';
  assert not has_function_privilege('anon', 'public.get_web_sync_record_part(text,bigint,integer)', 'execute'), 'Anonymous access must be denied';
  assert not has_function_privilege('anon', 'public.list_web_sync_records(timestamptz,text)', 'execute'), 'Anonymous list access must be denied';
  perform set_config('request.jwt.claim.sub', '', true);
  assert public.get_web_sync_record_part(v_key, 42, 0)->>'error' = 'UNAUTHORIZED', 'Missing identity must be rejected';
  assert not exists(select 1 from public.list_web_sync_records(null, v_key)), 'Missing identity must not list records';
end;
$test$;
reset role;
rollback;
