create table if not exists public.external_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('dida365')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  status text not null default 'active' check (status in ('active', 'error')),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.external_account_secrets (
  account_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_access_token text not null check (char_length(encrypted_access_token) between 20 and 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.external_accounts(id, user_id) on delete cascade
);

create table if not exists public.external_task_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  source_key text not null check (char_length(source_key) between 1 and 2000),
  external_project_id text not null,
  external_task_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.external_accounts(id, user_id) on delete cascade,
  unique (user_id, account_id, source_key)
);

create index if not exists external_accounts_user_provider_idx on public.external_accounts(user_id, provider);
create index if not exists external_task_links_account_idx on public.external_task_links(account_id);

alter table public.external_accounts enable row level security;
alter table public.external_account_secrets enable row level security;
alter table public.external_task_links enable row level security;

create policy "external_accounts_owner_all" on public.external_accounts
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "external_account_secrets_owner_all" on public.external_account_secrets
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "external_task_links_owner_all" on public.external_task_links
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.external_accounts to authenticated;
grant select, insert, update, delete on public.external_account_secrets to authenticated;
grant select, insert, update, delete on public.external_task_links to authenticated;
