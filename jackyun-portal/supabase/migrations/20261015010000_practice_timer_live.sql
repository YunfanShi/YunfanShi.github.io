create table public.practice_timer_live (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_id uuid, lease_token uuid, revision bigint not null default 0,
  payload jsonb, expires_at timestamptz, updated_at timestamptz not null default now(),
  constraint practice_timer_payload_size check (payload is null or octet_length(payload::text) <= 1048576)
);
alter table public.practice_timer_live enable row level security;
create policy practice_timer_live_owner_read on public.practice_timer_live for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.practice_timer_live from anon, authenticated;
grant select on public.practice_timer_live to authenticated;

-- One row lock per account fences every old device before accepting another save.
create or replace function public.practice_timer_control(p_action text, p_owner uuid default null, p_token uuid default null, p_revision bigint default null, p_payload jsonb default null, p_session text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); row_data public.practice_timer_live; stamp timestamptz := clock_timestamp(); through_time timestamptz;
begin
  if uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if p_action not in ('read','claim','save','touch','release') then raise exception 'invalid action'; end if;
  insert into public.practice_timer_live(user_id) values(uid) on conflict do nothing;
  select * into row_data from public.practice_timer_live where user_id = uid for update;
  through_time := least(stamp,coalesce(row_data.expires_at,stamp));
  if p_action = 'claim' then
    if p_owner is null or p_session is null then raise exception 'invalid claim'; end if;
    if row_data.payload is not null and coalesce((row_data.payload #>> '{session,finished}')::boolean,false) = false and row_data.payload #>> '{session,id}' <> p_session then
      return jsonb_build_object('conflict','ACTIVE_SESSION','payload',row_data.payload,'serverNow',extract(epoch from stamp)*1000);
    end if;
    row_data.owner_id := p_owner; row_data.lease_token := gen_random_uuid(); row_data.expires_at := stamp + interval '45 seconds';
    row_data.revision := row_data.revision + 1;
  elsif p_action <> 'read' then
    if row_data.owner_id is distinct from p_owner or row_data.lease_token is distinct from p_token or row_data.expires_at is null or row_data.expires_at <= stamp then
      return jsonb_build_object('conflict','LOST_CONTROL','serverNow',extract(epoch from stamp)*1000);
    end if;
    if p_action = 'save' then
      if p_revision is distinct from row_data.revision then return jsonb_build_object('conflict','STALE_REVISION','serverNow',extract(epoch from stamp)*1000); end if;
      if p_payload is null or octet_length(p_payload::text) > 1048576 then raise exception 'invalid payload'; end if;
      row_data.payload := p_payload; row_data.revision := row_data.revision + 1; row_data.updated_at := stamp;
    end if;
    row_data.expires_at := case when p_action = 'release' then stamp else stamp + interval '45 seconds' end;
  end if;
  if p_action <> 'read' then
    update public.practice_timer_live set owner_id=row_data.owner_id, lease_token=row_data.lease_token, revision=row_data.revision, payload=row_data.payload, expires_at=row_data.expires_at, updated_at=row_data.updated_at where user_id=uid;
  end if;
  return jsonb_build_object('countUntil',extract(epoch from through_time)*1000,'ownerId',row_data.owner_id,'token',case when p_action='claim' then row_data.lease_token else null end,'revision',row_data.revision,'payload',row_data.payload,'expiresAt',row_data.expires_at,'savedAt',row_data.updated_at,'serverNow',extract(epoch from stamp)*1000);
end;
$$;
revoke all on function public.practice_timer_control(text,uuid,uuid,bigint,jsonb,text) from public, anon;
grant execute on function public.practice_timer_control(text,uuid,uuid,bigint,jsonb,text) to authenticated;
