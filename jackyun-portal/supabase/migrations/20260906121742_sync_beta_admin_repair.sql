-- Repair production sync RPC drift and add explicit administrator operations.
-- This migration is intentionally idempotent so it can repair environments
-- where either of the two previous sync migrations was only partially applied.

alter table public.legacy_sync_data
  add column if not exists revision bigint not null default 1,
  add column if not exists content_hash text,
  add column if not exists source_device_id uuid references public.web_sync_devices(id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists client_updated_at timestamptz;

update public.legacy_sync_data
set client_updated_at = coalesce(client_updated_at, updated_at, now())
where client_updated_at is null;

alter table public.legacy_sync_data
  alter column client_updated_at set default now(),
  alter column client_updated_at set not null;

create or replace function public.normalize_web_sync_value(p_value jsonb)
returns jsonb
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare decoded jsonb;
begin
  if jsonb_typeof(p_value) <> 'string' then return p_value; end if;
  begin
    decoded := (p_value #>> '{}')::jsonb;
    return decoded;
  exception when others then
    return p_value;
  end;
end;
$$;

update public.legacy_sync_data
set storage_value = public.normalize_web_sync_value(storage_value)
where jsonb_typeof(storage_value) = 'string';

drop function if exists public.apply_web_sync_operation(uuid, uuid, text, bigint, text, jsonb, jsonb, text, boolean);
drop function if exists public.apply_web_sync_operation(uuid, uuid, text, bigint, text, jsonb, jsonb, text, boolean, timestamptz);

create function public.apply_web_sync_operation(
  p_operation_id uuid,
  p_device_id uuid,
  p_storage_key text,
  p_base_revision bigint,
  p_base_hash text,
  p_base_value jsonb,
  p_value jsonb,
  p_content_hash text,
  p_deleted boolean,
  p_client_updated_at timestamptz
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
  effective_updated_at timestamptz := greatest(
    now() - interval '30 days',
    least(coalesce(p_client_updated_at, now()), now() + interval '5 minutes')
  );
  local_wins boolean;
begin
  if current_user_id is null then raise exception 'Unauthorized'; end if;
  if p_storage_key is null or char_length(p_storage_key) not between 1 and 120 then
    raise exception 'Invalid storage key';
  end if;
  if not exists (
    select 1 from public.web_sync_devices
    where id = p_device_id and user_id = current_user_id and revoked_at is null
  ) then raise exception 'Invalid or revoked device'; end if;

  select result into operation_result
  from public.sync_operations
  where id = p_operation_id and user_id = current_user_id;
  if operation_result is not null then return operation_result; end if;

  select * into current_record
  from public.legacy_sync_data
  where user_id = current_user_id and storage_key = p_storage_key
  for update;

  if not found then
    insert into public.legacy_sync_data (
      user_id, storage_key, storage_value, revision, content_hash,
      source_device_id, deleted_at, updated_at, client_updated_at
    ) values (
      current_user_id, p_storage_key,
      coalesce(public.normalize_web_sync_value(p_value), 'null'::jsonb),
      1, p_content_hash, p_device_id,
      case when p_deleted then now() else null end,
      now(), effective_updated_at
    );
    operation_result := jsonb_build_object(
      'status', 'applied', 'revision', 1,
      'contentHash', p_content_hash, 'updatedAt', effective_updated_at
    );
  elsif (current_record.deleted_at is not null) = p_deleted
    and (p_deleted or public.normalize_web_sync_value(current_record.storage_value)
      = public.normalize_web_sync_value(p_value)) then
    update public.legacy_sync_data
    set storage_value = coalesce(public.normalize_web_sync_value(p_value), 'null'::jsonb),
        content_hash = p_content_hash
    where id = current_record.id;
    operation_result := jsonb_build_object(
      'status', 'applied', 'revision', current_record.revision,
      'contentHash', p_content_hash, 'updatedAt', current_record.client_updated_at
    );
  else
    local_wins := (
      current_record.revision = p_base_revision
      and (p_base_hash is null or current_record.content_hash is not distinct from p_base_hash)
    ) or effective_updated_at > current_record.client_updated_at
      or (effective_updated_at = current_record.client_updated_at
        and p_device_id::text > coalesce(current_record.source_device_id::text, ''));

    if local_wins then
      next_revision := current_record.revision + 1;
      update public.legacy_sync_data
      set storage_value = coalesce(public.normalize_web_sync_value(p_value), 'null'::jsonb),
          revision = next_revision,
          content_hash = p_content_hash,
          source_device_id = p_device_id,
          deleted_at = case when p_deleted then now() else null end,
          updated_at = now(),
          client_updated_at = effective_updated_at
      where id = current_record.id;
      operation_result := jsonb_build_object(
        'status', 'applied', 'revision', next_revision,
        'contentHash', p_content_hash, 'updatedAt', effective_updated_at
      );
    else
      operation_result := jsonb_build_object(
        'status', 'remote', 'revision', current_record.revision,
        'remoteValue', case when current_record.deleted_at is null
          then public.normalize_web_sync_value(current_record.storage_value) else null end,
        'remoteDeleted', current_record.deleted_at is not null,
        'remoteHash', current_record.content_hash,
        'remoteUpdatedAt', current_record.client_updated_at
      );
    end if;
  end if;

  insert into public.sync_operations (id, user_id, device_id, storage_key, result)
  values (p_operation_id, current_user_id, p_device_id, p_storage_key, operation_result)
  on conflict (id) do nothing;
  update public.web_sync_devices
  set last_seen_at = now(), updated_at = now()
  where id = p_device_id and user_id = current_user_id;
  return operation_result;
end;
$$;

revoke all on function public.normalize_web_sync_value(jsonb) from public, anon;
grant execute on function public.normalize_web_sync_value(jsonb) to authenticated;
revoke all on function public.apply_web_sync_operation(uuid, uuid, text, bigint, text, jsonb, jsonb, text, boolean, timestamptz) from public, anon;
grant execute on function public.apply_web_sync_operation(uuid, uuid, text, bigint, text, jsonb, jsonb, text, boolean, timestamptz) to authenticated;

-- Admins may opt their own account directly into BETA. Other accounts still
-- receive an invitation and must explicitly accept the agreement.
create or replace function public.admin_set_beta_invitation(
  p_user_id uuid,
  p_invited boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare is_self boolean := p_user_id = auth.uid();
begin
  if not public.is_admin_user() then raise exception 'Forbidden: Admin only'; end if;

  insert into public.beta_enrollments (
    user_id, status, invited_by, invited_at, responded_at, agreement_version, updated_at
  ) values (
    p_user_id,
    case when p_invited and is_self then 'accepted'
         when p_invited then 'invited' else 'revoked' end,
    auth.uid(), now(),
    case when p_invited and is_self then now() else null end,
    case when p_invited and is_self then 'admin-self-enrollment-v1' else null end,
    now()
  )
  on conflict (user_id) do update set
    status = excluded.status,
    invited_by = excluded.invited_by,
    invited_at = excluded.invited_at,
    responded_at = excluded.responded_at,
    agreement_version = excluded.agreement_version,
    updated_at = now();
end;
$$;

-- Use a privileged database function instead of relying on cross-user profile
-- UPDATE policies. The role check remains server-authoritative.
create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin_user() then raise exception 'Forbidden: Admin only'; end if;
  if p_role not in ('user', 'admin') then raise exception 'Invalid role'; end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'Administrators cannot remove their own role';
  end if;

  update public.profiles
  set role = p_role, updated_at = now()
  where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
end;
$$;

revoke all on function public.admin_set_beta_invitation(uuid, boolean) from public, anon;
revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_set_beta_invitation(uuid, boolean) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
