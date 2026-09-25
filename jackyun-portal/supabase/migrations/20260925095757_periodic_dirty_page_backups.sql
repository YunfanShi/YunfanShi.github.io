-- Lightweight dirty markers replace a full JSON snapshot on every changed row.
-- Active clients ask for due backups every five minutes; each page can create
-- at most one cloud version in a fifteen-minute window.
insert into public.backup_center_preferences (user_id, max_versions)
select id, 5 from auth.users
on conflict (user_id) do update set max_versions = 5;

create or replace function public.create_backup_page(target_page text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  insert into public.backup_center_preferences(user_id, max_versions) values (owner_id, 5)
    on conflict (user_id) do update set max_versions = 5;
  return jackyun_private.save_backup_page(owner_id, target_page, 'manual');
end;
$$;

create table jackyun_private.backup_dirty_pages (
  user_id uuid not null references auth.users(id) on delete cascade,
  page text not null check (page in (
    'schedule','study','definitions','ielts','vocabulary','quiz','poetry','music',
    'countdown','relax','reader','sites','settings','other'
  )),
  changed_at timestamptz not null default now(),
  primary key (user_id, page)
);
alter table jackyun_private.backup_dirty_pages enable row level security;
revoke all on jackyun_private.backup_dirty_pages from public, anon, authenticated;

create or replace function jackyun_private.backup_before_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  changed record;
  target_user uuid;
  target_page text;
begin
  if current_setting('jackyun.backup_suppressed', true) = 'on' or pg_catalog.pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'INSERT' then changed := new; else changed := old; end if;
  if tg_op = 'UPDATE' and to_jsonb(old) = to_jsonb(new) then return new; end if;
  if tg_table_name = 'legacy_sync_data' then
    if not jackyun_private.backup_key_allowed(changed.storage_key) then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    target_page := jackyun_private.backup_page_for_key(changed.storage_key);
  elsif tg_table_name = 'user_settings' then
    if changed.key not in ('general_preferences','appearance_preferences','companion_preferences',
      'learning_preferences','advanced_preferences','language_preference',
      'theme_preference','sidebar_preferences','interface_customization','profile','tts_config') then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;
    target_page := 'settings';
  else
    target_page := jackyun_private.backup_table_page(tg_table_name);
  end if;
  if tg_table_name = 'quiz_questions' then
    select s.user_id into target_user from public.quiz_sessions s where s.id = changed.session_id;
    if target_user is null and tg_op = 'DELETE' then return old; end if;
  else
    target_user := changed.user_id;
  end if;
  if target_user is null or target_page is null then raise exception 'Cannot mark backup page for %', tg_table_name; end if;
  insert into jackyun_private.backup_dirty_pages(user_id, page, changed_at)
  values (target_user, target_page, now())
  on conflict (user_id, page) do update set changed_at = excluded.changed_at;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare table_name text;
begin
  for table_name in select unnest(array[
    'vocab_words','vocab_stats','vocab_settings',
    'study_plans','study_tasks','study_syllabus','study_config','study_mock_records',
    'poems','poem_sessions','playlists','tracks','music_songs','music_settings',
    'countdowns','quiz_subjects','quiz_sessions','quiz_questions','quiz_settings',
    'review_items','review_attempts','relax_chat','relax_state',
    'focus_settings','focus_tasks','focus_sessions',
    'reader_books','personal_sites','companion_learning_queue','timetable_hub_data',
    'user_settings','legacy_sync_data'
  ]) loop
    execute pg_catalog.format('create trigger backup_center_before_change before insert or update or delete on public.%I for each row execute function jackyun_private.backup_before_change()', table_name);
  end loop;
end $$;

create function public.create_due_backup_pages()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := (select auth.uid());
  dirty record;
  newest timestamptz;
  created integer := 0;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  insert into public.backup_center_preferences(user_id, max_versions) values (owner_id, 5)
    on conflict (user_id) do update set max_versions = 5;
  for dirty in select user_id, page from jackyun_private.backup_dirty_pages
    where user_id = owner_id order by page for update skip locked
  loop
    select max(created_at) into newest from public.backup_center_versions
      where user_id = owner_id and page = dirty.page;
    if newest is null or newest <= now() - interval '15 minutes' then
      perform jackyun_private.save_backup_page(owner_id, dirty.page, 'automatic');
      delete from jackyun_private.backup_dirty_pages
        where user_id = owner_id and page = dirty.page;
      created := created + 1;
    end if;
  end loop;
  return created;
end;
$$;
revoke all on function public.create_due_backup_pages() from public, anon, authenticated;
grant execute on function public.create_due_backup_pages() to authenticated;
