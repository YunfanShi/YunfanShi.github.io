create table if not exists public.ielts_writing_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspaces jsonb not null default '[]'::jsonb check (jsonb_typeof(workspaces) = 'array'),
  error_history jsonb not null default '[]'::jsonb check (jsonb_typeof(error_history) = 'array'),
  archive jsonb not null default '[]'::jsonb check (jsonb_typeof(archive) = 'array'),
  learning_settings jsonb not null default '{}'::jsonb check (jsonb_typeof(learning_settings) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.ielts_writing_workspaces enable row level security;
create policy "Users read own IELTS Writing workspaces" on public.ielts_writing_workspaces
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own IELTS Writing workspaces" on public.ielts_writing_workspaces
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own IELTS Writing workspaces" on public.ielts_writing_workspaces
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update on public.ielts_writing_workspaces to authenticated;
