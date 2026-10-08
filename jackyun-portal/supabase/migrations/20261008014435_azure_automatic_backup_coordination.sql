-- Source history/control belongs on Supabase, never on the Azure copy.
DO $$ BEGIN
  IF current_database() ~ '^jackyun_migration_[0-9]{8}$' THEN
    RAISE EXCEPTION 'Only Supabase source backup migrations are allowed';
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

-- Receipts contain only capture metadata. Private, no direct user access.
create table jackyun_private.backup_capture_receipts (
  user_id uuid not null, page text not null,
  source_generation uuid, azure_generation uuid,
  version_id bigint not null references public.backup_center_versions(id) on delete cascade,
  unique nulls not distinct (user_id,page,source_generation,azure_generation),
  check (source_generation is not null or azure_generation is not null)
);
alter table jackyun_private.backup_capture_receipts enable row level security;
revoke all on jackyun_private.backup_capture_receipts from public, anon, authenticated;

create function public.list_backup_change_markers()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid()); result jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id=owner_id and account_status='active' and deleted_at is null) then
    raise exception 'Active account required';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'page',page,'generation',generation,'due',change_bytes>=4194304 or first_changed_at<=now()-interval '15 minutes') order by page),'[]'::jsonb)
    into result from jackyun_private.backup_dirty_pages where user_id=owner_id;
  return result;
end;
$$;
revoke all on function public.list_backup_change_markers() from public, anon, authenticated;
grant execute on function public.list_backup_change_markers() to authenticated;

create function public.create_automatic_backup_with_sync(
  target_page text, sync_records jsonb, source_generation uuid, azure_generation uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid()); version_id bigint;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  perform 1 from public.profiles where id=owner_id and account_status='active' and deleted_at is null for share;
  if not found then raise exception 'Active account required'; end if;
  if target_page is null or target_page not in
    ('schedule','study','definitions','ielts','vocabulary','quiz','poetry','music','countdown','relax','reader','sites','settings','other')
    or (source_generation is null and azure_generation is null) then raise exception 'Invalid backup capture'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || ':' || target_page,0));
  -- A successful source commit may have removed its marker before an Azure
  -- acknowledgment failed. With no new source marker, reuse that saved capture.
  select r.version_id into version_id from jackyun_private.backup_capture_receipts r
    where r.user_id=owner_id and r.page=target_page
      and r.azure_generation is not distinct from create_automatic_backup_with_sync.azure_generation
      and (r.source_generation is not distinct from create_automatic_backup_with_sync.source_generation
        or (create_automatic_backup_with_sync.source_generation is null
          and create_automatic_backup_with_sync.azure_generation is not null
          and not exists (select 1 from jackyun_private.backup_dirty_pages d where d.user_id=owner_id and d.page=target_page)))
    order by r.version_id desc limit 1;
  if found then return pg_catalog.jsonb_build_object('versionId',version_id,'created',false); end if;
  -- Hold this page's marker through snapshot and acknowledgment. A business
  -- writer waiting in its trigger creates/updates a fresh marker after commit.
  perform 1 from jackyun_private.backup_dirty_pages where user_id=owner_id and page=target_page for update;
  version_id := public.create_backup_page_with_sync(target_page,sync_records,'automatic');
  insert into jackyun_private.backup_capture_receipts(user_id,page,source_generation,azure_generation,version_id)
    values(owner_id,target_page,source_generation,azure_generation,version_id);
  delete from jackyun_private.backup_dirty_pages d where d.user_id=owner_id and d.page=target_page
    and d.generation=create_automatic_backup_with_sync.source_generation;
  return pg_catalog.jsonb_build_object('versionId',version_id,'created',true);
end;
$$;
revoke all on function public.create_automatic_backup_with_sync(text,jsonb,uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_automatic_backup_with_sync(text,jsonb,uuid,uuid) to authenticated;

-- Azure asks for this proof with the same verified user bearer token. The
-- receipt and version must have committed before the generation can be cleared.
create function public.confirm_backup_capture(target_page text, expected_generation uuid, target_version_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id=owner_id and account_status='active' and deleted_at is null) then
    raise exception 'Active account required';
  end if;
  return exists (select 1 from jackyun_private.backup_capture_receipts r
    join public.backup_center_versions v on v.id=r.version_id and v.user_id=owner_id and v.page=target_page
    where r.user_id=owner_id and r.page=target_page and r.azure_generation=expected_generation and r.version_id=target_version_id);
end;
$$;
revoke all on function public.confirm_backup_capture(text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.confirm_backup_capture(text,uuid,bigint) to authenticated;
