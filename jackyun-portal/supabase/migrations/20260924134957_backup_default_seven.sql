alter table public.backup_center_preferences
  alter column max_versions set default 7;
alter table public.backup_center_preferences
  drop constraint if exists backup_center_preferences_max_versions_check;
alter table public.backup_center_preferences
  add constraint backup_center_preferences_max_versions_check
  check (max_versions in (7, 20, 50, 100));

create or replace function jackyun_private.save_backup_page(
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

create or replace function public.set_backup_limit(new_limit integer)
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
