-- Preserve the previous Schedule before every changed cloud write. A blank
-- browser state cannot replace a Schedule that contains user work.
create table public.schedule_version_backups (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  storage_value jsonb not null,
  created_at timestamptz not null default now()
);

create index schedule_version_backups_user_created_idx
  on public.schedule_version_backups (user_id, created_at desc, id desc);

alter table public.schedule_version_backups enable row level security;
create policy "Users read own Schedule backups" on public.schedule_version_backups
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.schedule_version_backups from public, anon, authenticated;
grant select on public.schedule_version_backups to authenticated;

create schema if not exists jackyun_private;
revoke all on schema jackyun_private from public, anon, authenticated;

create function jackyun_private.schedule_has_content(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'object' and (
    coalesce(value->'timetable', 'null'::jsonb) <> 'null'::jsonb
    or (jsonb_typeof(value->'importedAt') = 'string' and coalesce(value->>'importedAt', '') <> '')
    or exists (
      select 1 from unnest(array[
        'manualTasks', 'completions', 'cancellations', 'reviewProgress',
        'cues', 'cueReviews', 'learningRecords', 'learningCatalog',
        'learningReminders', 'cueCollectionUpdates', 'cueMemos'
      ]) as fields(field_name)
      where jsonb_typeof(value->field_name) in ('array', 'object')
        and value->field_name not in ('[]'::jsonb, '{}'::jsonb)
    )
  );
$$;

create function jackyun_private.backup_schedule_before_change()
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
  if old.deleted_at is null and (select jackyun_private.schedule_has_content(old.storage_value)) then
    insert into public.schedule_version_backups (user_id, revision, storage_value)
    values (old.user_id, old.revision, old.storage_value);
    delete from public.schedule_version_backups
    where user_id = old.user_id and created_at < now() - interval '90 days';
  end if;
  return new;
end;
$$;

revoke all on function jackyun_private.schedule_has_content(jsonb) from public, anon, authenticated;
revoke all on function jackyun_private.backup_schedule_before_change() from public, anon, authenticated;

create trigger backup_schedule_before_change
before update on public.legacy_sync_data
for each row execute function jackyun_private.backup_schedule_before_change();

-- Seed one restorable baseline for accounts that already have Schedule data.
insert into public.schedule_version_backups (user_id, revision, storage_value)
select user_id, revision, storage_value from public.legacy_sync_data
where storage_key = 'jackyun_schedule_control_v1' and deleted_at is null
  and jackyun_private.schedule_has_content(storage_value);
