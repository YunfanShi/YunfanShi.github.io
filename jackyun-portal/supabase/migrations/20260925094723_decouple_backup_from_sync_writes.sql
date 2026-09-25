-- A full page snapshot for every changed row made sync batches quadratic and
-- held database locks while Auth and Storage requests waited. Keep existing
-- versions intact for incident recovery; only explicit cloud backups continue.
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
    execute pg_catalog.format('drop trigger if exists backup_center_before_change on public.%I', table_name);
  end loop;
end $$;

-- Preserve the empty-Schedule guard without adding another cloud version on
-- every revision. Older Schedule history remains readable and restorable.
create or replace function jackyun_private.backup_schedule_before_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.storage_key <> 'jackyun_schedule_control_v1'
     or (old.storage_value, old.deleted_at) is not distinct from (new.storage_value, new.deleted_at) then
    return new;
  end if;
  if (select jackyun_private.schedule_has_content(old.storage_value))
     and (new.deleted_at is not null or not (select jackyun_private.schedule_has_content(new.storage_value))) then
    raise exception 'Empty Schedule cannot replace existing data' using errcode = '23514';
  end if;
  return new;
end;
$$;

update public.backup_center_preferences set max_versions = 5 where max_versions <> 5;
alter table public.backup_center_preferences alter column max_versions set default 5;
alter table public.backup_center_preferences drop constraint if exists backup_center_preferences_max_versions_check;
alter table public.backup_center_preferences add constraint backup_center_preferences_max_versions_check
  check (max_versions = 5);

-- Do not prune older versions during this migration: they may be the only
-- copies available to an account affected by the outage. New manual backups
-- follow the five-version limit through save_backup_page.
create or replace function public.set_backup_limit(new_limit integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if new_limit <> 5 then raise exception 'Cloud backup limit is five'; end if;
  insert into public.backup_center_preferences(user_id, max_versions)
  values ((select auth.uid()), 5)
  on conflict (user_id) do update set max_versions = 5;
end;
$$;
