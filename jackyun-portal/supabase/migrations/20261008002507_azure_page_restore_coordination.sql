-- Supabase source coordination only; never install on the Azure copy.
do $$ begin
 if current_database() ~ '^jackyun_migration_[0-9]{8}$' then raise exception 'Source restore migration only'; end if;
end $$;
create table jackyun_private.page_restore_jobs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,page text not null,
 backup_id bigint not null references public.backup_center_versions(id),before_id bigint not null references public.backup_center_versions(id),
 request_ids uuid[] not null,final_before_id bigint references public.backup_center_versions(id),snapshot jsonb not null,plan jsonb not null,status text not null default 'prepared' check(status in ('prepared','completed','cancelled')),
 created_at timestamptz not null default now(),completed_at timestamptz
);
create unique index page_restore_one_pending on jackyun_private.page_restore_jobs(user_id,page) where status='prepared';
create index page_restore_user on jackyun_private.page_restore_jobs(user_id);
create index page_restore_backup on jackyun_private.page_restore_jobs(backup_id);
create index page_restore_before on jackyun_private.page_restore_jobs(before_id);
create index page_restore_final_before on jackyun_private.page_restore_jobs(final_before_id);
create index page_restore_requests on jackyun_private.page_restore_jobs using gin(request_ids);
alter table jackyun_private.page_restore_jobs enable row level security;
revoke all on jackyun_private.page_restore_jobs from public,anon,authenticated;

create function jackyun_private.restore_source_business(owner_id uuid,page_name text,snapshot_value jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare table_name text;table_rows jsonb;conflict_column text;assignments text;collision boolean;old_suppression text:=current_setting('jackyun.backup_suppressed',true);
begin
 perform pg_catalog.set_config('jackyun.backup_suppressed','on',true);
  for table_name in select unnest(array[
    'vocab_words','vocab_stats','vocab_settings',
    'study_plans','study_tasks','study_syllabus','study_config','study_mock_records',
    'poems','poem_sessions','playlists','tracks','music_songs','music_settings',
    'countdowns','focus_settings','focus_tasks','focus_sessions',
    'quiz_subjects','quiz_sessions','quiz_questions','quiz_settings',
    'review_items','review_attempts','relax_chat','relax_state',
    'reader_books','personal_sites','companion_learning_queue','timetable_hub_data',
    'user_settings'
  ]) loop
    table_rows := snapshot_value -> table_name;
    if table_rows is not null and jackyun_private.backup_table_page(table_name) is distinct from page_name then raise exception 'Backup page mismatch'; end if;
    if table_rows is null then continue; end if;
    if jsonb_typeof(table_rows) is distinct from 'array' then raise exception 'Invalid business snapshot'; end if;
    if jsonb_array_length(table_rows)=0 then continue; end if;
    execute pg_catalog.format('lock table public.%I in share row exclusive mode',table_name);
    if table_name = 'quiz_questions' then
      if exists (select 1 from jsonb_array_elements(table_rows) item
        left join public.quiz_sessions s on s.id = (item->>'session_id')::uuid
        where s.user_id is distinct from owner_id) then
        raise exception 'Invalid quiz backup ownership';
      end if;
    elsif exists (select 1 from jsonb_array_elements(table_rows) item
      where item->>'user_id' is distinct from owner_id::text) then
      raise exception 'Invalid backup ownership for %', table_name;
    end if;
    if table_name = 'user_settings' and exists (
      select 1 from jsonb_array_elements(table_rows) item where coalesce(item->>'key','') not in
        ('general_preferences','appearance_preferences','companion_preferences',
         'learning_preferences','advanced_preferences','language_preference',
         'theme_preference','sidebar_preferences','interface_customization','profile','tts_config')
    ) then raise exception 'Invalid settings backup'; end if;
    -- A saved row may have a valid owner field but collide with another
    -- account's primary key. Lock and reject that collision before upsert.
    if table_name = 'quiz_questions' then
      if exists(select 1 from public.quiz_questions q join public.quiz_sessions s on s.id=q.session_id
        where q.id in (select (item->>'id')::uuid from jsonb_array_elements(table_rows) item) and s.user_id is distinct from owner_id) then
        raise exception 'Existing quiz row belongs to another account';
      end if;
    elsif table_name not in ('reader_books','focus_settings','quiz_settings') then
      execute pg_catalog.format('select exists(select 1 from public.%I t join pg_catalog.jsonb_populate_recordset(null::public.%I,$1) r on t.id=r.id where t.user_id is distinct from $2)',table_name,table_name)
        into collision using table_rows,owner_id;
      if collision then raise exception 'Existing row belongs to another account'; end if;
    end if;
    conflict_column := case
      when table_name = 'reader_books' then 'user_id, book_id'
      when table_name in ('focus_settings','quiz_settings') then 'user_id'
      else 'id' end;
    select pg_catalog.string_agg(pg_catalog.format('%I = excluded.%I', a.attname, a.attname), ', ')
      into assignments from pg_catalog.pg_attribute a
      where a.attrelid = pg_catalog.format('public.%I', table_name)::pg_catalog.regclass
        and a.attnum > 0 and not a.attisdropped and a.attname <> conflict_column
        and not (table_name = 'reader_books' and a.attname in ('user_id','book_id'))
        and a.attgenerated = '' and a.attname <> 'user_id';
    execute pg_catalog.format(
      'insert into public.%I select * from pg_catalog.jsonb_populate_recordset(null::public.%I, $1) on conflict (%s) do update set %s',
      table_name, table_name, conflict_column, assignments
    ) using table_rows;
  end loop;
 perform pg_catalog.set_config('jackyun.backup_suppressed',coalesce(old_suppression,'off'),true);
end $$;
revoke all on function jackyun_private.restore_source_business(uuid,text,jsonb) from public,anon,authenticated;

create function public.prepare_azure_page_restore(backup_id bigint,current_sync_records jsonb,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid();saved record;job jackyun_private.page_restore_jobs;before_id bigint;plan jsonb;item jsonb;expected jsonb;
begin
 if owner_id is null then raise exception 'Authentication required'; end if;
 perform 1 from public.profiles where id=owner_id and account_status='active' and deleted_at is null for share;
 if not found then raise exception 'Active account required'; end if;
 if request_id is null then raise exception 'Restore request required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text||':restore:'||request_id::text,0));
 select * into job from jackyun_private.page_restore_jobs j where j.user_id=owner_id and j.request_ids @> array[request_id];
 if found then
   if job.backup_id<>backup_id then raise exception 'Restore request mismatch'; end if;
   if job.status='cancelled' then raise exception 'Restore was cancelled'; end if;
   return jsonb_build_object('id',job.id,'page',job.page,'beforeId',job.before_id,'plan',job.plan);
 end if;
 select v.page,v.snapshot into saved from public.backup_center_versions v where v.id=backup_id and v.user_id=owner_id;
 if not found then raise exception 'Backup not found'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text||':'||saved.page,0));
 select v.page,v.snapshot into saved from public.backup_center_versions v where v.id=backup_id and v.user_id=owner_id for share;
 if not found then raise exception 'Backup not found'; end if;
 select * into job from jackyun_private.page_restore_jobs j where j.user_id=owner_id and j.page=saved.page and j.status='prepared' for update;
 if found then
   if job.backup_id<>backup_id then raise exception 'Another page restore is pending'; end if;
   update jackyun_private.page_restore_jobs set request_ids=array_append(request_ids,request_id) where id=job.id;
   return jsonb_build_object('id',job.id,'page',job.page,'beforeId',job.before_id,'plan',job.plan);
 end if;
 if jsonb_typeof(saved.snapshot) is distinct from 'object' or octet_length(saved.snapshot::text)>67108864 then raise exception 'Invalid restore snapshot'; end if;
 if exists(select 1 from jsonb_object_keys(saved.snapshot) k where k<>'legacy_sync_data' and jackyun_private.backup_table_page(k) is distinct from saved.page) then raise exception 'Invalid snapshot table'; end if;
 if jsonb_typeof(coalesce(saved.snapshot->'legacy_sync_data','[]')) is distinct from 'array' then raise exception 'Invalid sync snapshot'; end if;
 if jsonb_array_length(coalesce(saved.snapshot->'legacy_sync_data','[]'))>20000 then raise exception 'Restore exceeds key limit'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(saved.snapshot->'legacy_sync_data','[]')) r
   where r->>'user_id' is distinct from owner_id::text or not jackyun_private.backup_key_allowed(r->>'storage_key')
   or jackyun_private.backup_page_for_key(r->>'storage_key') is distinct from saved.page or not(r?'storage_value')) then raise exception 'Invalid restore ownership or key'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(saved.snapshot->'legacy_sync_data','[]')) r group by r->>'storage_key' having count(*)>1) then raise exception 'Duplicate restore key'; end if;
 -- Protect the requested historical version before retention cleanup runs.
 update public.backup_center_versions v set retention_exempt=true where v.id=backup_id and v.user_id=owner_id;
 before_id := public.create_backup_page_with_sync(saved.page,current_sync_records,'before_restore');
 plan := '[]';
 for item in select * from jsonb_array_elements(coalesce(saved.snapshot->'legacy_sync_data','[]')) loop
   select r into expected from jsonb_array_elements(current_sync_records) r where r->>'storage_key'=item->>'storage_key';
   plan := plan || jsonb_build_array(jsonb_build_object('key',item->>'storage_key','value',item->'storage_value','deleted',item->>'deleted_at' is not null,
     'expected',expected,'operationId',gen_random_uuid(),'clientUpdatedAt',clock_timestamp()));
 end loop;
 insert into jackyun_private.page_restore_jobs(user_id,page,backup_id,before_id,request_ids,snapshot,plan)
 values(owner_id,saved.page,backup_id,before_id,array[request_id],saved.snapshot,plan) returning * into job;
 return jsonb_build_object('id',job.id,'page',job.page,'beforeId',job.before_id,'plan',job.plan);
end $$;

create function public.finish_azure_page_restore(restore_id uuid,restored_sync_records jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid();job jackyun_private.page_restore_jobs;table_name text;checkpoint_id bigint;
begin
 if owner_id is null then raise exception 'Authentication required'; end if;
 perform 1 from public.profiles where id=owner_id and account_status='active' and deleted_at is null for share;
 if not found then raise exception 'Active account required'; end if;
 select * into job from jackyun_private.page_restore_jobs j where j.id=restore_id and j.user_id=owner_id;
 if not found then raise exception 'Restore not found'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text||':'||job.page,0));
 select * into job from jackyun_private.page_restore_jobs j where j.id=restore_id and j.user_id=owner_id for update;
 if not found then raise exception 'Restore not found'; end if;
 if job.status='completed' then return jsonb_build_object('page',job.page,'completed',true); end if;
 if job.status='cancelled' then raise exception 'Restore was cancelled'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text||':'||job.page,0));
 -- Capture source changes that arrived after the first recovery backup.
 -- Lock every page business table before reading that checkpoint.
 for table_name in select k from jsonb_object_keys(job.snapshot) k where k<>'legacy_sync_data' order by k loop
   if jackyun_private.backup_table_page(table_name) is distinct from job.page then raise exception 'Invalid snapshot table'; end if;
   execute pg_catalog.format('lock table public.%I in share row exclusive mode',table_name);
 end loop;
 checkpoint_id := public.create_backup_page_with_sync(job.page,restored_sync_records,'before_restore');
 perform jackyun_private.restore_source_business(owner_id,job.page,job.snapshot);
 update jackyun_private.page_restore_jobs set status='completed',completed_at=now(),final_before_id=checkpoint_id where id=job.id;
 return jsonb_build_object('page',job.page,'completed',true);
end $$;
revoke all on function public.prepare_azure_page_restore(bigint,jsonb,uuid),public.finish_azure_page_restore(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_azure_page_restore(bigint,jsonb,uuid),public.finish_azure_page_restore(uuid,jsonb) to authenticated;

-- Cancellation preserves both current data and the durable recovery backup.
create function public.cancel_azure_page_restore(request_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();job jackyun_private.page_restore_jobs;
begin
 if owner_id is null then raise exception 'Authentication required'; end if;
 perform 1 from public.profiles where id=owner_id and account_status='active' and deleted_at is null for share;
 if not found then raise exception 'Active account required'; end if;
 select * into job from jackyun_private.page_restore_jobs j where j.user_id=owner_id and j.request_ids @> array[request_id] for update;
 if not found then return false; end if;
 if job.status='prepared' then update jackyun_private.page_restore_jobs set status='cancelled' where id=job.id; end if;
 return true;
end $$;
revoke all on function public.cancel_azure_page_restore(uuid) from public,anon,authenticated;
grant execute on function public.cancel_azure_page_restore(uuid) to authenticated;
