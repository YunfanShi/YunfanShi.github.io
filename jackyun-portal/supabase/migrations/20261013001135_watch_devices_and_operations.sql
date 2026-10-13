begin;
create table public.watch_devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null, secret_hash text not null check(length(secret_hash)=64), name text not null check(length(name) between 1 and 100),
 access_hash text not null check(length(access_hash)=64), refresh_hash text not null check(length(refresh_hash)=64), session_payload text not null,
 created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), revoked_at timestamptz
);
create index watch_devices_user_idx on public.watch_devices(user_id, created_at desc);
alter table public.watch_devices enable row level security;
revoke all on public.watch_devices from anon, authenticated;
grant select(id,user_id,name,created_at,last_seen_at,revoked_at) on public.watch_devices to authenticated;
create policy watch_devices_own_read on public.watch_devices for select to authenticated using ((select auth.uid())=user_id);
create table public.watch_pairings (
 id uuid primary key, code text not null unique, claim_hash text not null check(length(claim_hash)=64),
 name text not null, expires_at timestamptz not null, user_id uuid references auth.users(id) on delete cascade,
 payload text, approved_at timestamptz, created_at timestamptz not null default now()
);
alter table public.watch_pairings enable row level security;
revoke all on public.watch_pairings from public, anon, authenticated;
create table public.watch_rate_limits (bucket text primary key, window_start timestamptz not null, requests integer not null);
alter table public.watch_rate_limits enable row level security;
revoke all on public.watch_rate_limits from public, anon, authenticated;
grant all on public.watch_devices,public.watch_pairings,public.watch_rate_limits to service_role;
create function public.watch_rate_limit(p_bucket text, p_limit integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 delete from public.watch_rate_limits where window_start < now()-interval '1 day';
 insert into public.watch_rate_limits values(p_bucket,date_trunc('minute',now()),1)
 on conflict(bucket) do update set requests=case when watch_rate_limits.window_start=date_trunc('minute',now()) then watch_rate_limits.requests+1 else 1 end,
 window_start=date_trunc('minute',now()) returning requests into n;
 return n<=p_limit;
end $$;
revoke all on function public.watch_rate_limit(text,integer) from public,anon,authenticated;
grant execute on function public.watch_rate_limit(text,integer) to service_role;
create function public.watch_claim_pair(p_id uuid,p_hash text) returns text
language plpgsql security invoker set search_path='' as $$
declare result text;
begin
 delete from public.watch_pairings where id=p_id and claim_hash=p_hash and expires_at>now() and payload is not null returning payload into result;
 return result;
end $$;
revoke all on function public.watch_claim_pair(uuid,text) from public,anon,authenticated;
grant execute on function public.watch_claim_pair(uuid,text) to service_role;
create table public.watch_operation_receipts (
 user_id uuid not null references auth.users(id) on delete cascade, operation_id uuid not null,
 payload_hash text not null, result jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), primary key(user_id,operation_id)
);
alter table public.watch_operation_receipts enable row level security;
create policy watch_receipts_own on public.watch_operation_receipts for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update on public.watch_operation_receipts to authenticated;
revoke all on public.watch_operation_receipts from anon;
create function public.watch_apply_operation(p_operation uuid,p_hash text,p_kind text,p_target uuid,p_version timestamptz,p_details jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.watch_operation_receipts; changed uuid; seconds integer; started timestamptz; finished timestamptz;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
 insert into public.watch_operation_receipts(user_id,operation_id,payload_hash) values(auth.uid(),p_operation,p_hash) on conflict do nothing;
 select * into old from public.watch_operation_receipts where user_id=auth.uid() and operation_id=p_operation for update;
 if old.payload_hash<>p_hash then raise exception 'OPERATION_REUSED'; end if;
 if old.result<>'{}'::jsonb then return old.result; end if;
 if p_kind='task' then
   if jsonb_typeof(p_details->'completed')<>'boolean' or p_version is null then raise exception 'INVALID_OPERATION'; end if;
   update public.study_tasks set completed=(p_details->>'completed')::boolean,completed_at=case when (p_details->>'completed')::boolean then now() else null end,updated_at=now()
   where id=p_target and user_id=auth.uid() and updated_at=p_version returning id into changed;
   if changed is null then raise exception 'VERSION_CONFLICT'; end if;
 elsif p_kind='notification' then
   perform 1 from public.site_notifications where id=p_target;
   if not found then raise exception 'NOT_FOUND'; end if;
   insert into public.notification_dismissals(notification_id,user_id) values(p_target,auth.uid()) on conflict(notification_id,user_id) do nothing;
 elsif p_kind='focus' then
   seconds=(p_details->>'durationSeconds')::integer;
   started=to_timestamp((p_details->>'startedAt')::double precision/1000);
   finished=to_timestamp((p_details->>'completedAt')::double precision/1000);
   if seconds is null or seconds not between 60 and 21600 or started is null or finished is null or finished<started or finished>now()+interval '5 minutes' or finished-started<make_interval(secs=>seconds) then raise exception 'INVALID_OPERATION'; end if;
   insert into public.focus_sessions(user_id,duration_seconds,started_at,completed_at,planned_seconds,outcome,client_operation_id,source,session_note)
   values(auth.uid(),seconds,started,finished,(p_details->>'plannedSeconds')::integer,'completed',p_operation::text,'portal','JackYun Watch') on conflict(user_id,client_operation_id) do nothing;
 else raise exception 'INVALID_OPERATION'; end if;
 update public.watch_operation_receipts set result='{"ok":true}'::jsonb where user_id=auth.uid() and operation_id=p_operation;
 return '{"ok":true}'::jsonb;
end $$;
revoke all on function public.watch_apply_operation(uuid,text,text,uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.watch_apply_operation(uuid,text,text,uuid,timestamptz,jsonb) to authenticated;
commit;
