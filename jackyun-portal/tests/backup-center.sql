-- Run against the local Supabase database with psql -v ON_ERROR_STOP=1 -f.
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
update public.legacy_sync_data set storage_value = '{"cues":[{"id":"first"},{"id":"second"}]}'::jsonb,
  revision = 2, content_hash = 'second-hash'
where user_id = '00000000-0000-4000-8000-000000000101' and storage_key = 'jackyun_schedule_control_v1';

do $$ begin
  if not exists (
    select 1 from public.backup_center_versions
    where user_id = '00000000-0000-4000-8000-000000000101' and page = 'schedule'
      and reason = 'automatic'
      and snapshot->'legacy_sync_data'->0->'storage_value' = '{"cues":[{"id":"first"}]}'::jsonb
  ) then raise exception 'Old Schedule state was not backed up'; end if;
end $$;

insert into public.user_settings(user_id, key, value)
values ('00000000-0000-4000-8000-000000000101', 'theme_preference', '{"theme":"light"}');
update public.user_settings set value = '{"theme":"dark"}'
where user_id = '00000000-0000-4000-8000-000000000101' and key = 'theme_preference';

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
select public.restore_backup_page((
  select id from public.backup_center_versions where page = 'schedule' and reason = 'automatic'
    and snapshot->'legacy_sync_data'->0->'storage_value' = '{"cues":[{"id":"first"}]}'::jsonb
  order by id desc limit 1
));
do $$ begin
  if (select storage_value from public.legacy_sync_data where storage_key = 'jackyun_schedule_control_v1')
    <> '{"cues":[{"id":"first"}]}'::jsonb then
    raise exception 'Schedule page restore did not apply';
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
insert into public.timetable_hub_data(user_id, th_state)
values ('00000000-0000-4000-8000-000000000101', '{"slots":[1]}');
update public.timetable_hub_data set th_state = '{"slots":[2]}'
where user_id = '00000000-0000-4000-8000-000000000101';
select public.restore_backup_page((
  select id from public.backup_center_versions where page = 'schedule' and reason = 'automatic'
    and snapshot->'timetable_hub_data'->0->'th_state' = '{"slots":[1]}'::jsonb
  order by id desc limit 1
));
do $$ begin
  if (select th_state from public.timetable_hub_data limit 1) <> '{"slots":[1]}'::jsonb then
    raise exception 'Timetable Hub restore did not apply';
  end if;
end $$;
select public.restore_backup_page((
  select id from public.backup_center_versions where page = 'settings' and reason = 'automatic'
  and snapshot->'user_settings'->0->'value' = '{"theme":"light"}'::jsonb order by id desc limit 1
));
do $$ begin
  if (select value from public.user_settings where key = 'theme_preference') <> '{"theme":"light"}'::jsonb then
    raise exception 'Settings restore did not apply';
  end if;
  if not exists (select 1 from public.backup_center_versions where page = 'settings' and reason = 'before_restore') then
    raise exception 'Restore did not protect current state';
  end if;
end $$;

insert into public.quiz_subjects(user_id, name)
values ('00000000-0000-4000-8000-000000000101', 'Backup Test');
insert into public.quiz_sessions(user_id, subject_name)
values ('00000000-0000-4000-8000-000000000101', 'Backup Test');
insert into public.quiz_questions(session_id, question_text, correct_answer)
select id, 'Original question', 'A' from public.quiz_sessions where subject_name = 'Backup Test';
update public.quiz_questions set question_text = 'Changed question' where question_text = 'Original question';
select public.restore_backup_page((
  select id from public.backup_center_versions where page = 'quiz' and reason = 'automatic'
    and snapshot->'quiz_questions'->0->>'question_text' = 'Original question'
  order by id desc limit 1
));
do $$ begin
  if (select question_text from public.quiz_questions limit 1) <> 'Original question' then
    raise exception 'Quiz page restore did not apply';
  end if;
end $$;
insert into public.quiz_questions(session_id, question_text, correct_answer)
select s.id, 'Cascade question ' || n, 'A'
from public.quiz_sessions s cross join generate_series(1, 60) n where s.subject_name = 'Backup Test';
delete from public.quiz_sessions where subject_name = 'Backup Test';
do $$ begin
  if (
    select jsonb_array_length(snapshot->'quiz_questions') from public.backup_center_versions
    where page = 'quiz' order by id desc limit 1
  ) <> 61 then raise exception 'Cascade deleted data without preserving the full page'; end if;
end $$;

insert into public.reader_books(user_id, book_id, storage_path, metadata)
values ('00000000-0000-4000-8000-000000000101', 'book-1',
  'users/00000000-0000-4000-8000-000000000101/book-1.json', '{"title":"Original"}');
update public.reader_books set metadata = '{"title":"Changed"}' where book_id = 'book-1';
select public.restore_backup_page((
  select id from public.backup_center_versions where page = 'reader' and reason = 'automatic'
    and snapshot->'reader_books'->0->'metadata' = '{"title":"Original"}'::jsonb
  order by id desc limit 1
));
do $$ begin
  if (select metadata from public.reader_books where book_id = 'book-1') <> '{"title":"Original"}'::jsonb then
    raise exception 'Reader metadata restore did not apply';
  end if;
end $$;

insert into public.personal_sites(user_id, name, definition)
values ('00000000-0000-4000-8000-000000000101', 'Original site', '{"pages":[]}');
update public.personal_sites set name = 'Changed site' where name = 'Original site';
select public.restore_backup_page((
  select id from public.backup_center_versions where page = 'sites' and reason = 'automatic'
    and snapshot->'personal_sites'->0->>'name' = 'Original site'
  order by id desc limit 1
));
do $$ begin
  if (select name from public.personal_sites limit 1) <> 'Original site' then
    raise exception 'Personal site restore did not apply';
  end if;
end $$;

do $$ declare index_number integer; begin
  for index_number in 1..12 loop
    perform public.create_backup_page('settings');
  end loop;
  if (select count(*) from public.backup_center_versions where page = 'settings') <> 7 then
    raise exception 'Default version cap was not enforced';
  end if;
  perform public.set_backup_limit(4);
  if (select count(*) from public.backup_center_versions where page = 'settings') <> 4 then
    raise exception 'Lowering the retention limit did not prune immediately';
  end if;
end $$;
rollback;
