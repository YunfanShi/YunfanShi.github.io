-- A changed page is snapshotted after 4 MiB of changed row data OR 15 minutes
-- from its first unsaved change. Deleting its dirty marker resets both clocks.
alter table jackyun_private.backup_dirty_pages
  add column change_bytes bigint not null default 0,
  add column first_changed_at timestamptz not null default now();
update jackyun_private.backup_dirty_pages set first_changed_at = changed_at;

create or replace function jackyun_private.backup_before_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  changed record;
  target_user uuid;
  target_page text;
  changed_bytes bigint;
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
  if tg_op = 'DELETE' then changed_bytes := pg_catalog.pg_column_size(old);
  else changed_bytes := pg_catalog.pg_column_size(new); end if;
  insert into jackyun_private.backup_dirty_pages(user_id, page, changed_at, first_changed_at, change_bytes)
  values (target_user, target_page, now(), now(), least(1048576::bigint, greatest(1::bigint, changed_bytes)))
  on conflict (user_id, page) do update set
    changed_at = excluded.changed_at,
    change_bytes = least(4194304::bigint, jackyun_private.backup_dirty_pages.change_bytes + excluded.change_bytes);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.create_due_backup_pages()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := (select auth.uid());
  dirty record;
  created integer := 0;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  for dirty in select user_id, page, change_bytes, first_changed_at
    from jackyun_private.backup_dirty_pages
    where user_id = owner_id order by page for update skip locked
  loop
    if dirty.change_bytes >= 4194304 or dirty.first_changed_at <= now() - interval '15 minutes' then
      perform jackyun_private.save_backup_page(owner_id, dirty.page, 'automatic');
      delete from jackyun_private.backup_dirty_pages
        where user_id = owner_id and page = dirty.page;
      created := created + 1;
    end if;
  end loop;
  return created;
end;
$$;

create or replace function public.create_backup_page(target_page text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := (select auth.uid());
  version_id bigint;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  version_id := jackyun_private.save_backup_page(owner_id, target_page, 'manual');
  delete from jackyun_private.backup_dirty_pages where user_id = owner_id and page = target_page;
  return version_id;
end;
$$;
