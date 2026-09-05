-- Link study planning to the existing focus workspace without replacing either model.

alter table public.study_tasks
  add column if not exists subject text,
  add column if not exists estimated_minutes integer not null default 25,
  add column if not exists priority smallint not null default 3,
  add column if not exists scheduled_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.study_tasks
  drop constraint if exists study_tasks_subject_length_check,
  add constraint study_tasks_subject_length_check
    check (subject is null or char_length(trim(subject)) between 1 and 80),
  drop constraint if exists study_tasks_estimated_minutes_check,
  add constraint study_tasks_estimated_minutes_check
    check (estimated_minutes between 10 and 360),
  drop constraint if exists study_tasks_priority_check,
  add constraint study_tasks_priority_check
    check (priority between 1 and 5);

alter table public.focus_tasks
  add column if not exists study_task_id uuid references public.study_tasks(id) on delete set null;

alter table public.focus_tasks
  drop constraint if exists focus_tasks_study_task_id_key,
  add constraint focus_tasks_study_task_id_key unique (study_task_id);

alter table public.focus_sessions
  add column if not exists study_task_id uuid references public.study_tasks(id) on delete set null,
  add column if not exists planned_seconds integer,
  add column if not exists outcome text,
  add column if not exists session_note text,
  add column if not exists client_operation_id text;

alter table public.focus_sessions
  drop constraint if exists focus_sessions_planned_seconds_check,
  add constraint focus_sessions_planned_seconds_check
    check (planned_seconds is null or planned_seconds between 60 and 21600),
  drop constraint if exists focus_sessions_outcome_check,
  add constraint focus_sessions_outcome_check
    check (outcome is null or outcome in ('completed', 'partial', 'interrupted')),
  drop constraint if exists focus_sessions_note_length_check,
  add constraint focus_sessions_note_length_check
    check (session_note is null or char_length(session_note) <= 500),
  drop constraint if exists focus_sessions_operation_length_check,
  add constraint focus_sessions_operation_length_check
    check (client_operation_id is null or char_length(client_operation_id) between 1 and 128);

alter table public.focus_sessions
  drop constraint if exists focus_sessions_user_operation_key,
  add constraint focus_sessions_user_operation_key unique (user_id, client_operation_id);

create index if not exists focus_sessions_user_study_task_idx
  on public.focus_sessions(user_id, study_task_id, completed_at desc);
create index if not exists study_tasks_user_schedule_idx
  on public.study_tasks(user_id, completed, scheduled_at, due_date);

-- Existing tables already have ownership-based RLS. Repeat the enable operation as
-- defense in depth and explicitly expose only the privileges used by the app.
alter table public.study_tasks enable row level security;
alter table public.focus_tasks enable row level security;
alter table public.focus_sessions enable row level security;

drop policy if exists "Users manage their focus tasks" on public.focus_tasks;
create policy "Users manage their focus tasks" on public.focus_tasks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      study_task_id is null
      or exists (
        select 1 from public.study_tasks
        where study_tasks.id = focus_tasks.study_task_id
          and study_tasks.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users manage their focus sessions" on public.focus_sessions;
create policy "Users manage their focus sessions" on public.focus_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      study_task_id is null
      or exists (
        select 1 from public.study_tasks
        where study_tasks.id = focus_sessions.study_task_id
          and study_tasks.user_id = (select auth.uid())
      )
    )
    and (
      task_id is null
      or exists (
        select 1 from public.focus_tasks
        where focus_tasks.id = focus_sessions.task_id
          and focus_tasks.user_id = (select auth.uid())
      )
    )
  );

grant select, insert, update, delete on table public.study_tasks to authenticated;
grant select, insert, update, delete on table public.focus_tasks to authenticated;
grant select, insert, update, delete on table public.focus_sessions to authenticated;
