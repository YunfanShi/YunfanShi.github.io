-- Source history/control belongs on Supabase, never on the Azure copy.
DO $$ BEGIN
  IF current_database() ~ '^jackyun_migration_[0-9]{8}$' THEN
    RAISE EXCEPTION 'Only Supabase source backup migrations are allowed';
  END IF;
END $$;
-- Candidate only: apply to the Supabase source before enabling Azure routing.
-- Application tables and version history stay on Supabase; sync values come from
-- the authenticated Azure read. Never write the frozen legacy_sync_data table.
create function public.create_backup_page_with_sync(
  target_page text, sync_records jsonb, backup_reason text default 'manual'
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := (select auth.uid());
  version_id bigint;
  rows_json jsonb;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  -- A verified JWT alone is insufficient after a suspension or deletion.
  perform 1 from public.profiles where id = owner_id
    and account_status = 'active' and deleted_at is null for share;
  if not found then raise exception 'Active account required'; end if;
  if target_page is null or target_page not in
    ('schedule','study','definitions','ielts','vocabulary','quiz','poetry','music','countdown','relax','reader','sites','settings','other')
    or backup_reason is null or backup_reason not in ('manual','before_restore','automatic') then
    raise exception 'Invalid backup page or reason';
  end if;
  if sync_records is null or pg_catalog.jsonb_typeof(sync_records) <> 'array' then
    raise exception 'Sync snapshot must be an array';
  end if;
  if pg_catalog.jsonb_array_length(sync_records) > 20000
    or pg_catalog.octet_length(sync_records::text) > 67108864 then
    raise exception 'Sync snapshot exceeds backup limit';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(sync_records) item
    where pg_catalog.jsonb_typeof(item) <> 'object'
      or item->>'user_id' is distinct from owner_id::text
      or item->>'storage_key' is null
      or not jackyun_private.backup_key_allowed(item->>'storage_key')
      or jackyun_private.backup_page_for_key(item->>'storage_key') is distinct from target_page
      or not (item ? 'storage_value')
      or pg_catalog.jsonb_typeof(item->'revision') is distinct from 'number'
      or item->>'revision' !~ '^[1-9][0-9]{0,15}$'
      or item->>'updated_at' is null
      or (item->>'content_hash' is not null and item->>'content_hash' !~ '^[a-fA-F0-9]{64}$')) then
    raise exception 'Invalid sync snapshot ownership, page or metadata';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(sync_records) item
    group by item->>'storage_key' having count(*) > 1) then
    raise exception 'Duplicate sync snapshot key';
  end if;
  -- Populate only the existing sync columns, discarding arbitrary extra fields.
  -- Casts also validate dates and database revision bounds before saving anything.
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'user_id',owner_id,'storage_key',t.storage_key,'storage_value',t.storage_value,
    'revision',t.revision,'content_hash',t.content_hash,'deleted_at',t.deleted_at,
    'client_updated_at',t.client_updated_at,'updated_at',t.updated_at) order by t.storage_key), '[]'::jsonb)
    into rows_json from pg_catalog.jsonb_populate_recordset(null::public.legacy_sync_data, sync_records) t;
  version_id := jackyun_private.save_backup_page(owner_id, target_page, backup_reason, 'azure_sync');
  update public.backup_center_versions set
    snapshot = pg_catalog.jsonb_set(snapshot, '{legacy_sync_data}', rows_json),
    retention_exempt = retention_exempt or backup_reason = 'before_restore'
    where id = version_id and user_id = owner_id;
  if not found then raise exception 'Backup snapshot was not saved'; end if;
  -- Do not consume either database's dirty marker here. A change during the
  -- cross-source read must remain eligible for the next automatic backup.
  return version_id;
end;
$$;
revoke all on function public.create_backup_page_with_sync(text,jsonb,text) from public, anon, authenticated;
grant execute on function public.create_backup_page_with_sync(text,jsonb,text) to authenticated;
