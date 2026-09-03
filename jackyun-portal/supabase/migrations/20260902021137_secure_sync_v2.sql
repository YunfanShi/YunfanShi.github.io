-- Reliable web/PWA sync, answer-sheet tenant isolation, and explicit Data API grants.

create table if not exists public.web_sync_devices (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  platform text not null default 'web' check (platform in ('web', 'pwa', 'mobile-web')),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

alter table public.legacy_sync_data
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists content_hash text,
  add column if not exists source_device_id uuid references public.web_sync_devices(id) on delete set null,
  add column if not exists deleted_at timestamptz;

create table if not exists public.sync_operations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.web_sync_devices(id) on delete cascade,
  storage_key text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.web_sync_devices(id) on delete cascade,
  operation_id uuid not null,
  storage_key text not null,
  base_revision bigint not null,
  base_value jsonb,
  local_value jsonb,
  local_deleted boolean not null default false,
  remote_value jsonb,
  remote_deleted boolean not null default false,
  remote_hash text,
  remote_revision bigint not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, operation_id)
);

create index if not exists legacy_sync_user_updated_idx
  on public.legacy_sync_data (user_id, updated_at, id);
create index if not exists sync_operations_user_created_idx
  on public.sync_operations (user_id, created_at);
create index if not exists sync_conflicts_user_open_idx
  on public.sync_conflicts (user_id, created_at desc) where resolved_at is null;
create index if not exists web_sync_devices_user_seen_idx
  on public.web_sync_devices (user_id, last_seen_at desc);

alter table public.web_sync_devices enable row level security;
alter table public.sync_operations enable row level security;
alter table public.sync_conflicts enable row level security;

drop policy if exists "Users can manage own legacy data" on public.legacy_sync_data;
create policy "Users manage own legacy data" on public.legacy_sync_data
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users manage own web sync devices" on public.web_sync_devices
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users read own sync operations" on public.sync_operations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own sync operations" on public.sync_operations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users manage own sync conflicts" on public.sync_conflicts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.web_sync_devices to authenticated;
grant select, insert, update, delete on public.legacy_sync_data to authenticated;
grant select, insert on public.sync_operations to authenticated;
grant select, insert, update on public.sync_conflicts to authenticated;

create or replace function public.apply_web_sync_operation(
  p_operation_id uuid,
  p_device_id uuid,
  p_storage_key text,
  p_base_revision bigint,
  p_base_hash text,
  p_base_value jsonb,
  p_value jsonb,
  p_content_hash text,
  p_deleted boolean
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_record public.legacy_sync_data%rowtype;
  operation_result jsonb;
  next_revision bigint;
begin
  if current_user_id is null then raise exception 'Unauthorized'; end if;
  if p_storage_key is null or char_length(p_storage_key) not between 1 and 120 then
    raise exception 'Invalid storage key';
  end if;
  if not exists (
    select 1 from public.web_sync_devices
    where id = p_device_id and user_id = current_user_id and revoked_at is null
  ) then raise exception 'Invalid or revoked device'; end if;

  select result into operation_result from public.sync_operations
    where id = p_operation_id and user_id = current_user_id;
  if operation_result is not null then return operation_result; end if;

  select * into current_record from public.legacy_sync_data
    where user_id = current_user_id and storage_key = p_storage_key for update;

  if not found then
    if p_base_revision <> 0 then
      insert into public.sync_conflicts
        (user_id, device_id, operation_id, storage_key, base_revision, base_value,
         local_value, local_deleted, remote_value, remote_deleted, remote_hash, remote_revision)
      values
        (current_user_id, p_device_id, p_operation_id, p_storage_key, p_base_revision, p_base_value,
         case when p_deleted then null else p_value end, p_deleted, null, true, null, 0)
      on conflict (user_id, operation_id) do nothing;
      operation_result := jsonb_build_object(
        'status', 'conflict', 'revision', 0, 'remoteValue', null, 'remoteDeleted', true
      );
    else
      insert into public.legacy_sync_data
        (user_id, storage_key, storage_value, revision, content_hash, source_device_id, deleted_at, updated_at)
      values
        (current_user_id, p_storage_key, coalesce(p_value, 'null'::jsonb), 1, p_content_hash, p_device_id,
         case when p_deleted then now() else null end, now());
      operation_result := jsonb_build_object('status', 'applied', 'revision', 1, 'contentHash', p_content_hash);
    end if;
  elsif current_record.revision = p_base_revision
      and (p_base_hash is null or current_record.content_hash is not distinct from p_base_hash) then
    next_revision := current_record.revision + 1;
    update public.legacy_sync_data set
      storage_value = coalesce(p_value, 'null'::jsonb),
      revision = next_revision,
      content_hash = p_content_hash,
      source_device_id = p_device_id,
      deleted_at = case when p_deleted then now() else null end,
      updated_at = now()
    where id = current_record.id;
    operation_result := jsonb_build_object('status', 'applied', 'revision', next_revision, 'contentHash', p_content_hash);
  else
    insert into public.sync_conflicts
      (user_id, device_id, operation_id, storage_key, base_revision, base_value,
       local_value, local_deleted, remote_value, remote_deleted, remote_hash, remote_revision)
    values
      (current_user_id, p_device_id, p_operation_id, p_storage_key, p_base_revision, p_base_value,
       case when p_deleted then null else p_value end, p_deleted,
       case when current_record.deleted_at is null then current_record.storage_value else null end,
       current_record.deleted_at is not null, current_record.content_hash,
       current_record.revision)
    on conflict (user_id, operation_id) do nothing;
    operation_result := jsonb_build_object(
      'status', 'conflict', 'revision', current_record.revision,
      'remoteValue', case when current_record.deleted_at is null then current_record.storage_value else null end,
      'remoteDeleted', current_record.deleted_at is not null,
      'remoteHash', current_record.content_hash
    );
  end if;

  insert into public.sync_operations (id, user_id, device_id, storage_key, result)
  values (p_operation_id, current_user_id, p_device_id, p_storage_key, operation_result)
  on conflict (user_id, id) do nothing;
  update public.web_sync_devices set last_seen_at = now(), updated_at = now()
    where id = p_device_id and user_id = current_user_id;
  return operation_result;
end;
$$;
revoke all on function public.apply_web_sync_operation(uuid, uuid, text, bigint, text, jsonb, jsonb, text, boolean) from public, anon;
grant execute on function public.apply_web_sync_operation(uuid, uuid, text, bigint, text, jsonb, jsonb, text, boolean) to authenticated;

-- Answer-sheet broadcasts are short-lived, so removing legacy unowned rows is safe.
delete from public.answer_sheet_broadcasts;
alter table public.answer_sheet_broadcasts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.answer_sheet_broadcasts alter column user_id set not null;
alter table public.answer_sheet_broadcasts
  add constraint answer_sheet_broadcasts_id_user_unique unique (id, user_id);

create table if not exists public.answer_sheet_consumptions (
  broadcast_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 1 and 120),
  consumed_at timestamptz not null default now(),
  primary key (broadcast_id, device_id),
  foreign key (broadcast_id, user_id)
    references public.answer_sheet_broadcasts(id, user_id) on delete cascade
);
alter table public.answer_sheet_consumptions enable row level security;

drop policy if exists "Allow insert broadcasts" on public.answer_sheet_broadcasts;
drop policy if exists "Allow read broadcasts" on public.answer_sheet_broadcasts;
drop policy if exists "Allow delete broadcasts" on public.answer_sheet_broadcasts;
create policy "Users insert own answer broadcasts" on public.answer_sheet_broadcasts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users read own answer broadcasts" on public.answer_sheet_broadcasts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users delete own answer broadcasts" on public.answer_sheet_broadcasts
  for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Users manage own answer consumptions" on public.answer_sheet_consumptions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, delete on public.answer_sheet_broadcasts to authenticated;
grant select, insert, delete on public.answer_sheet_consumptions to authenticated;
grant usage, select on sequence public.answer_sheet_broadcasts_id_seq to authenticated;

-- Remove deprecated role-based policies left by early profile migrations.
drop policy if exists "Service role full access" on public.profiles;
drop policy if exists "Service role can manage profiles" on public.profiles;

-- Repair the existing administrator export loop. The previous FOREACH form is
-- parsed by plpgsql_check as one brace-delimited table name and fails at runtime.
create or replace function public.admin_export_ticket_user_data(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  export_table text;
  table_rows jsonb;
  result jsonb := jsonb_build_object('exported_at', now(), 'version', 1, 'tables', '{}'::jsonb);
begin
  if not is_admin_user() then raise exception 'Forbidden'; end if;
  select user_id into target_user from bug_reports where id = p_report_id;
  if target_user is null then raise exception 'Report not found'; end if;

  for export_table in
    select unnest(array[
      'vocab_words', 'vocab_stats', 'vocab_settings', 'study_plans', 'study_tasks',
      'study_syllabus', 'study_config', 'study_mock_records', 'poems', 'poem_sessions',
      'playlists', 'tracks', 'music_songs', 'music_settings', 'countdowns',
      'quiz_subjects', 'quiz_sessions', 'quiz_settings', 'relax_chat', 'relax_state',
      'focus_settings', 'focus_tasks', 'focus_sessions', 'legacy_sync_data'
    ]::text[])
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where user_id = $1',
      export_table
    ) into table_rows using target_user;
    result := jsonb_set(result, array['tables', export_table], table_rows);
  end loop;

  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into table_rows
  from quiz_questions q join quiz_sessions s on s.id = q.session_id
  where s.user_id = target_user;
  result := jsonb_set(result, array['tables', 'quiz_questions'], table_rows);

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into table_rows
  from user_settings s where s.user_id = target_user and s.key <> 'ai_config';
  result := jsonb_set(result, array['tables', 'user_settings'], table_rows);

  insert into ticket_operation_audit(report_id, actor_id, operation, details)
  values (p_report_id, auth.uid(), 'user_data_exported', '{"excluded":"ai_config"}'::jsonb);
  return result;
end;
$$;
grant execute on function public.admin_export_ticket_user_data(uuid) to authenticated;

-- Final-state guardrails: every Data API table is RLS-protected, and no
-- SECURITY DEFINER function remains executable through PUBLIC/anon grants.
do $$
declare
  table_record record;
  function_record record;
begin
  for table_record in
    select schemaname, tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table %I.%I enable row level security', table_record.schemaname, table_record.tablename);
  end loop;

  for function_record in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon', function_record.signature);
  end loop;
end;
$$;
