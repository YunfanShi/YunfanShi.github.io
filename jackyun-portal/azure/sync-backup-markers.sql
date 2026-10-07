-- Apply only to the isolated Azure migration database, after sync-runtime.sql.
-- No direct table access or additional roles are granted to the runtime.
BEGIN;
DO $$ BEGIN
  IF current_database() !~ '^jackyun_migration_[0-9]{8}$' THEN
    RAISE EXCEPTION 'Only an isolated JackYun migration database is allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='jackyun_sync_runtime' AND NOT rolsuper AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'Safe sync runtime required';
  END IF;
END $$;
-- Each dirty-table mutation gets a new opaque generation, even when the
-- byte counter is saturated or changes share the same transaction timestamp.
alter table jackyun_private.backup_dirty_pages
  add column generation uuid not null default pg_catalog.gen_random_uuid();
alter table jackyun_private.backup_dirty_pages enable row level security;
create function jackyun_private.advance_backup_generation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.generation := pg_catalog.gen_random_uuid(); end if;
  return new;
end;
$$;
revoke all on function jackyun_private.advance_backup_generation() from public, anon, authenticated;
create trigger backup_dirty_generation before update on jackyun_private.backup_dirty_pages
  for each row execute function jackyun_private.advance_backup_generation();

create function public.sync_backup_markers()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid()); result jsonb;
begin
  if owner_id is null or not public.sync_identity_allowed() then raise exception 'Active identity required'; end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'page',page,'generation',generation,'due',change_bytes>=4194304 or first_changed_at<=now()-interval '15 minutes') order by page),'[]'::jsonb)
    into result from jackyun_private.backup_dirty_pages where user_id=owner_id;
  return result;
end;
$$;
create function public.ack_sync_backup_marker(target_page text, expected_generation uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid()); removed integer;
begin
  if owner_id is null or not public.sync_identity_allowed() then raise exception 'Active identity required'; end if;
  if target_page is null or target_page not in
    ('schedule','study','definitions','ielts','vocabulary','quiz','poetry','music','countdown','relax','reader','sites','settings','other')
    or expected_generation is null then raise exception 'Invalid backup marker'; end if;
  delete from jackyun_private.backup_dirty_pages where user_id=owner_id and page=target_page and generation=expected_generation;
  get diagnostics removed = row_count;
  return removed=1;
end;
$$;
revoke all on function public.sync_backup_markers(),public.ack_sync_backup_marker(text,uuid) from public, anon, authenticated;
grant execute on function public.sync_backup_markers(),public.ack_sync_backup_marker(text,uuid) to jackyun_sync_runtime;
COMMIT;
