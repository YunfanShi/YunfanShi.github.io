create or replace function public.save_settings_patch(p_key text, p_value jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := auth.uid(); saved jsonb;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_key not in ('general_preferences','appearance_preferences','companion_preferences','learning_preferences','advanced_preferences','page_preferences')
    or jsonb_typeof(p_value) <> 'object' or octet_length(p_value::text) > 20000 then
    raise exception 'Invalid preference patch' using errcode='22023';
  end if;
  insert into public.user_settings(user_id,key,value,updated_at) values(owner_id,p_key,p_value,clock_timestamp())
  on conflict(user_id,key) do update set value=coalesce(public.user_settings.value,'{}'::jsonb) || excluded.value, updated_at=excluded.updated_at
  returning value into saved;
  return saved;
end $$;
revoke all on function public.save_settings_patch(text,jsonb) from public, anon;
grant execute on function public.save_settings_patch(text,jsonb) to authenticated;
