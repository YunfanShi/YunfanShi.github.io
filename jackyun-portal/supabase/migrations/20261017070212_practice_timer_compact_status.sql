-- Ownership checks must not transfer the 100KB+ configuration or lock/write a row.
-- RLS and the explicit user predicate both constrain reads to the caller.
create or replace function public.practice_timer_status()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'ownerId', owner_id, 'revision', revision, 'hasSession', payload is not null,
      'sessionId', payload #>> '{session,id}', 'savedAt', updated_at)
    from public.practice_timer_live where user_id = (select auth.uid())
  ), jsonb_build_object('ownerId',null,'revision',0,'hasSession',false,'sessionId',null));
$$;
revoke all on function public.practice_timer_status() from public, anon;
grant execute on function public.practice_timer_status() to authenticated;

-- Keep the original RPC compatible with old deployments and preserve its fencing.
-- Strip the payload inside Postgres, before it leaves the database service.
create or replace function public.practice_timer_control_compact(
  p_action text, p_owner uuid default null, p_token uuid default null,
  p_revision bigint default null, p_payload jsonb default null, p_session text default null
) returns jsonb language sql security invoker set search_path = '' as $$
  select case when p_action in ('read','claim') then result else result - 'payload' end
  from (select public.practice_timer_control(p_action,p_owner,p_token,p_revision,p_payload,p_session) as result) response;
$$;
revoke all on function public.practice_timer_control_compact(text,uuid,uuid,bigint,jsonb,text) from public, anon;
grant execute on function public.practice_timer_control_compact(text,uuid,uuid,bigint,jsonb,text) to authenticated;
