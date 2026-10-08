-- Candidate source-only control. Activate atomically with the five-table fence.
DO $$ BEGIN
  IF current_database() ~ '^jackyun_migration_[0-9]{8}$' THEN
    RAISE EXCEPTION 'Only Supabase source backup migrations are allowed';
  END IF;
END $$;

create table jackyun_private.sync_source_control (
  singleton boolean primary key default true check (singleton),
  sync_backend text not null check (sync_backend in ('supabase','azure')),
  guard_version integer not null check (guard_version = 1)
);
insert into jackyun_private.sync_source_control values (true,'supabase',1);
alter table jackyun_private.sync_source_control enable row level security;
revoke all on jackyun_private.sync_source_control from public,anon,authenticated;

-- Hold this row until the caller transaction ends. The cutover takes its write
-- lock before the five sync-table locks, draining in-flight legacy RPCs safely.
create function jackyun_private.require_supabase_backup_source()
returns void language plpgsql security definer set search_path = '' as $$
declare current_backend text; owner_id uuid := (select auth.uid());
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  perform 1 from public.profiles where id=owner_id
    and account_status='active' and deleted_at is null;
  if not found then raise exception 'Active account required'; end if;
  select sync_backend into current_backend from jackyun_private.sync_source_control
    where singleton and guard_version=1 for share;
  if current_backend is distinct from 'supabase' then
    raise exception 'Use the active Azure backup route' using errcode='55000';
  end if;
end;
$$;
revoke all on function jackyun_private.require_supabase_backup_source() from public,anon,authenticated;

-- Preserve existing implementations and their dependencies. Only the guarded
-- public wrappers remain executable by authenticated clients.
alter function public.create_backup_page(text) set schema jackyun_private;
alter function jackyun_private.create_backup_page(text) rename to source_create_backup_page;
alter function public.create_due_backup_pages() set schema jackyun_private;
alter function jackyun_private.create_due_backup_pages() rename to source_create_due_backup_pages;
alter function public.restore_backup_page(bigint) set schema jackyun_private;
alter function jackyun_private.restore_backup_page(bigint) rename to source_restore_backup_page;
revoke all on function jackyun_private.source_create_backup_page(text),
  jackyun_private.source_create_due_backup_pages(),jackyun_private.source_restore_backup_page(bigint)
  from public,anon,authenticated;

create function public.create_backup_page(target_page text)
returns bigint language plpgsql security definer set search_path='' as $$
begin
  perform jackyun_private.require_supabase_backup_source();
  return jackyun_private.source_create_backup_page(target_page);
end;
$$;
create function public.create_due_backup_pages()
returns integer language plpgsql security definer set search_path='' as $$
begin
  perform jackyun_private.require_supabase_backup_source();
  return jackyun_private.source_create_due_backup_pages();
end;
$$;
create function public.restore_backup_page(backup_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform jackyun_private.require_supabase_backup_source();
  return jackyun_private.source_restore_backup_page(backup_id);
end;
$$;
revoke all on function public.create_backup_page(text),public.create_due_backup_pages(),
  public.restore_backup_page(bigint) from public,anon,authenticated;
grant execute on function public.create_backup_page(text),public.create_due_backup_pages(),
  public.restore_backup_page(bigint) to authenticated;
