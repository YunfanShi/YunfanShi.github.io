-- Page snapshots are written inside the same transaction as the data change.
-- The previous state is retained, so a bad write still has a recoverable copy.
create table public.backup_center_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  max_versions integer not null default 7 check (max_versions in (7, 20, 50, 100))
);
alter table public.backup_center_preferences enable row level security;
create policy "Users read own backup preferences" on public.backup_center_preferences
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.backup_center_preferences from public, anon, authenticated;
grant select on public.backup_center_preferences to authenticated;

create table public.backup_center_versions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  page text not null check (page in (
    'schedule', 'study', 'definitions', 'ielts', 'vocabulary', 'quiz',
    'poetry', 'music', 'countdown', 'relax', 'reader', 'sites', 'settings', 'other'
  )),
  reason text not null check (reason in ('automatic', 'baseline', 'before_restore', 'manual')),
  source_table text,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index backup_center_versions_user_page_idx
  on public.backup_center_versions (user_id, page, id desc);
alter table public.backup_center_versions enable row level security;
create policy "Users read own backup versions" on public.backup_center_versions
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.backup_center_versions from public, anon, authenticated;
grant select on public.backup_center_versions to authenticated;

create function jackyun_private.backup_page_for_key(key text)
returns text language sql immutable set search_path = '' as $$
  select case
    when key ~ '^(jackyun_schedule_|jack_timetable_|w3_schedule$)' then 'schedule'
    when key ~ '^(studyguide_|caie_|jackyun_goal_|jackyun_daily_plan$|th2_|control_|jackyun_control_)' then 'study'
    when key ~ '^(jackyun_definition_|jackyun_property_)' then 'definitions'
    when key like 'jackyun_ielts_%' then 'ielts'
    when key like 'LexiFlowPro_%' then 'vocabulary'
    when key ~ '^(quizwise_|igcse_|jackyun_answer_sheet_)' then 'quiz'
    when key = 'poemHistory' then 'poetry'
    when key ~ '^(v45_songs$|w3_song|w3_voice$|w10_autobgm$|bili_)' then 'music'
    when key ~ '^(jack_countdown_|jackyun_pomodoro_|cd_v2$|jack_water$|w3_date$|w3_week_plan$|gt_)' then 'countdown'
    when key ~ '^(jackyun_relax_|jackyun_settings_|jackyun_sidebar_|jackyun_theme$|jack_theme$|jack_lang_|jackyun_language$|show_fullscreen_btn$|profile$)' then 'settings'
    else 'other' end;
$$;

create function jackyun_private.backup_key_allowed(key text)
returns boolean language sql immutable set search_path = '' as $$
  select key is not null and length(key) between 1 and 120
    and key !~* '(password|passwd|secret|auth|supabase|api[_-]?key|access[_-]?token|refresh[_-]?token|service[_-]?role|(^|[_-])sk([_-]|$)|deviceid|broadcast|cookie|guest_mode|debug|log)'
    and key !~ '^(eruda-|getItem$|setItem$|removeItem$|jackyun_nav_timestamps$|jackyun_nav_usage_pending$|jackyun_backup_local_limit$)'
    and key not in ('jackyun-ai-config', 'enforcer_pin', 'jackyun_local_sync_meta_v1', 'jackyun_sync_timestamps');
$$;

create function jackyun_private.backup_table_page(table_name text)
returns text language sql immutable set search_path = '' as $$
  select case
    when table_name in ('vocab_words','vocab_stats','vocab_settings') then 'vocabulary'
    when table_name in ('study_plans','study_tasks','study_syllabus','study_config','study_mock_records') then 'study'
    when table_name in ('poems','poem_sessions') then 'poetry'
    when table_name in ('playlists','tracks','music_songs','music_settings') then 'music'
    when table_name in ('countdowns','focus_settings','focus_tasks','focus_sessions') then 'countdown'
    when table_name in ('quiz_subjects','quiz_sessions','quiz_questions','quiz_settings','review_items','review_attempts') then 'quiz'
    when table_name in ('relax_chat','relax_state') then 'relax'
    when table_name = 'reader_books' then 'reader'
    when table_name = 'personal_sites' then 'sites'
    when table_name = 'companion_learning_queue' then 'study'
    when table_name = 'timetable_hub_data' then 'schedule'
    when table_name = 'user_settings' then 'settings'
    else null end;
$$;

create function jackyun_private.save_backup_page(
  target_user uuid, target_page text, backup_reason text, changed_table text default null
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  table_name text;
  page_name text;
  table_rows jsonb;
  tables jsonb := '{}'::jsonb;
  new_id bigint;
  keep_count integer;
begin
  if target_page not in ('schedule','study','definitions','ielts','vocabulary','quiz','poetry','music','countdown','relax','reader','sites','settings','other') then
    raise exception 'Invalid backup page';
  end if;
  if backup_reason not in ('automatic','baseline','before_restore','manual') then
    raise exception 'Invalid backup reason';
  end if;
  -- Serializes the version number and retention cleanup for this account.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user::text || ':' || target_page, 0));
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
    page_name := jackyun_private.backup_table_page(table_name);
    if page_name <> target_page and table_name <> 'legacy_sync_data' then continue; end if;
    if table_name = 'quiz_questions' then
      execute 'select coalesce(jsonb_agg(to_jsonb(t) order by t.id), ''[]''::jsonb) from public.quiz_questions t join public.quiz_sessions s on s.id = t.session_id where s.user_id = $1'
        into table_rows using target_user;
    elsif table_name = 'legacy_sync_data' then
      select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) into table_rows
      from public.legacy_sync_data t where t.user_id = target_user
        and jackyun_private.backup_key_allowed(t.storage_key)
        and jackyun_private.backup_page_for_key(t.storage_key) = target_page;
    elsif table_name = 'user_settings' then
      select coalesce(jsonb_agg(to_jsonb(t) order by t.user_id, t.key), '[]'::jsonb) into table_rows
      from public.user_settings t where t.user_id = target_user
        and t.key in ('general_preferences','appearance_preferences','companion_preferences',
          'learning_preferences','advanced_preferences','language_preference',
          'theme_preference','sidebar_preferences','interface_customization','profile','tts_config');
    else
      execute pg_catalog.format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where t.user_id = $1', table_name)
        into table_rows using target_user;
    end if;
    tables := tables || jsonb_build_object(table_name, table_rows);
  end loop;
  insert into public.backup_center_versions(user_id, page, reason, source_table, snapshot)
  values (target_user, target_page, backup_reason, changed_table, tables) returning id into new_id;
  select coalesce((select max_versions from public.backup_center_preferences where user_id = target_user), 7) into keep_count;
  delete from public.backup_center_versions where id in (
    select id from public.backup_center_versions where user_id = target_user and page = target_page
    order by id desc offset keep_count
  );
  return new_id;
end;
$$;

create function jackyun_private.backup_before_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  changed record;
  target_user uuid;
  target_page text;
begin
  if current_setting('jackyun.backup_suppressed', true) = 'on' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  -- The parent write has already captured the page before FK cascades begin.
  if pg_catalog.pg_trigger_depth() > 1 then
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
  if target_page is null then raise exception 'Missing backup page for %', tg_table_name; end if;
  if tg_table_name = 'quiz_questions' then
    select s.user_id into target_user from public.quiz_sessions s where s.id = changed.session_id;
    -- Deleting a session already captured the whole Quiz page; its cascading
    -- question deletes may no longer be able to see the parent row.
    if target_user is null and tg_op = 'DELETE' then return old; end if;
  else
    target_user := changed.user_id;
  end if;
  if target_user is null then raise exception 'Cannot resolve backup owner for %', tg_table_name; end if;
  perform jackyun_private.save_backup_page(target_user, target_page, 'automatic', tg_table_name);
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
end;
$$;

create function public.create_backup_page(target_page text)
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  return jackyun_private.save_backup_page((select auth.uid()), target_page, 'manual');
end;
$$;
revoke all on function public.create_backup_page(text) from public, anon, authenticated;
grant execute on function public.create_backup_page(text) to authenticated;
revoke all on function jackyun_private.save_backup_page(uuid,text,text,text) from public, anon, authenticated;
revoke all on function jackyun_private.backup_before_change() from public, anon, authenticated;

create function public.set_backup_limit(new_limit integer)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if new_limit not in (7, 20, 50, 100) then raise exception 'Invalid backup limit'; end if;
  insert into public.backup_center_preferences(user_id, max_versions)
  values (owner_id, new_limit)
  on conflict (user_id) do update set max_versions = excluded.max_versions;
  delete from public.backup_center_versions where id in (
    select id from (
      select id, row_number() over (partition by page order by id desc) as position
      from public.backup_center_versions where user_id = owner_id
    ) ranked where position > new_limit
  );
end;
$$;
revoke all on function public.set_backup_limit(integer) from public, anon, authenticated;
grant execute on function public.set_backup_limit(integer) to authenticated;

-- A restore merges saved rows into the current page. Rows created later remain;
-- the whole current page is saved before the first restored row is written.
create function public.restore_backup_page(backup_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := (select auth.uid());
  saved record;
  table_name text;
  table_rows jsonb;
  conflict_column text;
  assignments text;
  restored_keys jsonb := '[]'::jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  select page, snapshot into saved from public.backup_center_versions
  where id = backup_id and user_id = owner_id;
  if not found then raise exception 'Backup not found'; end if;
  perform jackyun_private.save_backup_page(owner_id, saved.page, 'before_restore');
  perform pg_catalog.set_config('jackyun.backup_suppressed', 'on', true);
  for table_name in select unnest(array[
    'vocab_words','vocab_stats','vocab_settings',
    'study_plans','study_tasks','study_syllabus','study_config','study_mock_records',
    'poems','poem_sessions','playlists','tracks','music_songs','music_settings',
    'countdowns','focus_settings','focus_tasks','focus_sessions',
    'quiz_subjects','quiz_sessions','quiz_questions','quiz_settings',
    'review_items','review_attempts','relax_chat','relax_state',
    'reader_books','personal_sites','companion_learning_queue','timetable_hub_data',
    'user_settings','legacy_sync_data'
  ]) loop
    table_rows := saved.snapshot -> table_name;
    if table_rows is null or jsonb_typeof(table_rows) <> 'array' or jsonb_array_length(table_rows) = 0 then continue; end if;
    if table_name = 'legacy_sync_data' then
      if exists (select 1 from jsonb_array_elements(table_rows) item
        where item->>'user_id' is distinct from owner_id::text
          or not jackyun_private.backup_key_allowed(item->>'storage_key')
          or jackyun_private.backup_page_for_key(item->>'storage_key') <> saved.page) then
        raise exception 'Invalid legacy backup ownership or key';
      end if;
      insert into public.legacy_sync_data (
        user_id, storage_key, storage_value, revision, content_hash,
        deleted_at, client_updated_at, updated_at
      ) select owner_id, t.storage_key, t.storage_value, 1, t.content_hash,
        t.deleted_at, now(), now()
        from jsonb_populate_recordset(null::public.legacy_sync_data, table_rows) t
      on conflict (user_id, storage_key) do update set
        storage_value = excluded.storage_value,
        revision = public.legacy_sync_data.revision + 1,
        content_hash = excluded.content_hash,
        deleted_at = excluded.deleted_at,
        client_updated_at = now(), updated_at = now();
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', t.storage_key, 'value', t.storage_value, 'revision', t.revision,
        'contentHash', t.content_hash, 'deleted', t.deleted_at is not null,
        'updatedAt', t.updated_at
      )), '[]'::jsonb) into restored_keys
      from public.legacy_sync_data t where t.user_id = owner_id
        and t.storage_key in (select item->>'storage_key' from jsonb_array_elements(table_rows) item);
      continue;
    end if;
    if table_name = 'quiz_questions' then
      if exists (select 1 from jsonb_array_elements(table_rows) item
        left join public.quiz_sessions s on s.id = (item->>'session_id')::uuid
        where s.user_id is distinct from owner_id) then
        raise exception 'Invalid quiz backup ownership';
      end if;
    elsif exists (select 1 from jsonb_array_elements(table_rows) item
      where item->>'user_id' is distinct from owner_id::text) then
      raise exception 'Invalid backup ownership for %', table_name;
    end if;
    if table_name = 'user_settings' and exists (
      select 1 from jsonb_array_elements(table_rows) item where item->>'key' not in
        ('general_preferences','appearance_preferences','companion_preferences',
         'learning_preferences','advanced_preferences','language_preference',
         'theme_preference','sidebar_preferences','interface_customization','profile','tts_config')
    ) then raise exception 'Invalid settings backup'; end if;
    conflict_column := case
      when table_name = 'reader_books' then 'user_id, book_id'
      when table_name in ('focus_settings','quiz_settings') then 'user_id'
      else 'id' end;
    select pg_catalog.string_agg(pg_catalog.format('%I = excluded.%I', a.attname, a.attname), ', ')
      into assignments from pg_catalog.pg_attribute a
      where a.attrelid = pg_catalog.format('public.%I', table_name)::pg_catalog.regclass
        and a.attnum > 0 and not a.attisdropped and a.attname <> conflict_column
        and not (table_name = 'reader_books' and a.attname in ('user_id','book_id'))
        and a.attgenerated = '';
    execute pg_catalog.format(
      'insert into public.%I select * from pg_catalog.jsonb_populate_recordset(null::public.%I, $1) on conflict (%s) do update set %s',
      table_name, table_name, conflict_column, assignments
    ) using table_rows;
  end loop;
  perform pg_catalog.set_config('jackyun.backup_suppressed', 'off', true);
  return jsonb_build_object('page', saved.page, 'legacyRecords', restored_keys);
end;
$$;
revoke all on function public.restore_backup_page(bigint) from public, anon, authenticated;
grant execute on function public.restore_backup_page(bigint) to authenticated;

-- Establish the first restorable state for accounts with existing data.
do $$
declare account record; page_name text;
begin
  for account in select distinct user_id from public.legacy_sync_data
    union select distinct user_id from public.study_plans
    union select distinct user_id from public.vocab_words
    union select distinct user_id from public.quiz_sessions
    union select distinct user_id from public.user_settings
    union select distinct user_id from public.reader_books
    union select distinct user_id from public.personal_sites
    union select distinct user_id from public.companion_learning_queue
    union select distinct user_id from public.timetable_hub_data
  loop
    for page_name in select unnest(array['schedule','study','definitions','ielts','vocabulary','quiz','poetry','music','countdown','relax','reader','sites','settings','other']) loop
      perform jackyun_private.save_backup_page(account.user_id, page_name, 'baseline');
    end loop;
  end loop;
end;
$$;
