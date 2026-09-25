-- Run after local migrations with psql -v ON_ERROR_STOP=1 -f. Rolled back.
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'backup-test@example.invalid', '', now(), now(), now());
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000102', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'backup-other@example.invalid', '', now(), now(), now());

insert into public.legacy_sync_data(user_id, storage_key, storage_value, revision, content_hash)
values ('00000000-0000-4000-8000-000000000101', 'jackyun_schedule_control_v1',
  '{"cues":[{"id":"first"}]}'::jsonb, 1, 'first-hash');
update public.legacy_sync_data set storage_value = '{"cues":[{"id":"second"}]}'::jsonb,
  revision = 2, content_hash = 'second-hash'
where user_id = '00000000-0000-4000-8000-000000000101' and storage_key = 'jackyun_schedule_control_v1';
do $$ begin
  if exists (select 1 from public.backup_center_versions where user_id = '00000000-0000-4000-8000-000000000101') then
    raise exception 'A sync write still created a full-page cloud backup';
  end if;
end $$;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
select public.create_due_backup_pages();
do $$ begin
  if not exists (select 1 from public.backup_center_versions where page = 'schedule' and reason = 'automatic') then
    raise exception 'Changed Schedule was not saved by the periodic backup';
  end if;
end $$;
select public.create_backup_page('schedule');

reset role;
update public.legacy_sync_data set storage_value = '{"cues":[{"id":"third"}]}'::jsonb,
  revision = 3, content_hash = 'third-hash'
where user_id = '00000000-0000-4000-8000-000000000101' and storage_key = 'jackyun_schedule_control_v1';
set local role authenticated;
select public.restore_backup_page((
  select id from public.backup_center_versions where page = 'schedule' and reason = 'manual' order by id desc limit 1
));
do $$ begin
  if (select storage_value from public.legacy_sync_data where storage_key = 'jackyun_schedule_control_v1')
     <> '{"cues":[{"id":"second"}]}'::jsonb then
    raise exception 'Manual Schedule backup did not restore';
  end if;
  if not exists (select 1 from public.backup_center_versions where page = 'schedule' and reason = 'before_restore') then
    raise exception 'Restore did not protect current state';
  end if;
end $$;

do $$ declare target_id bigint; rejected boolean := false; begin
  select id into target_id from public.backup_center_versions where page = 'schedule' limit 1;
  perform pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);
  begin
    perform public.restore_backup_page(target_id);
  exception when others then rejected := true;
  end;
  perform pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
  if not rejected then raise exception 'Another user restored this backup'; end if;
end $$;

reset role;
insert into public.backup_center_versions(user_id, page, reason, snapshot, retention_exempt)
values ('00000000-0000-4000-8000-000000000101', 'settings', 'baseline', '{}'::jsonb, true);
set local role authenticated;
do $$ declare index_number integer; begin
  for index_number in 1..7 loop
    perform public.create_backup_page('settings');
  end loop;
  if (select count(*) from public.backup_center_versions where page = 'settings' and not retention_exempt) <> 5 then
    raise exception 'New cloud backups must retain five versions per page';
  end if;
  if (select count(*) from public.backup_center_versions where page = 'settings' and retention_exempt) <> 1 then
    raise exception 'Pre-incident backup disappeared';
  end if;
end $$;
rollback;
