-- Stage large sync requests in bounded, user-owned parts before applying the
-- existing per-key operation atomically through apply_web_sync_operation.
create table public.web_sync_upload_chunks (
  user_id uuid not null references auth.users(id) on delete cascade,
  upload_id uuid not null,
  part_index integer not null check (part_index between 0 and 199),
  part_count integer not null check (part_count between 1 and 200 and part_index < part_count),
  data text not null check (char_length(data) between 1 and 180000),
  created_at timestamptz not null default now(),
  primary key (user_id, upload_id, part_index)
);

create index web_sync_upload_chunks_created_idx
  on public.web_sync_upload_chunks (user_id, created_at);

alter table public.web_sync_upload_chunks enable row level security;
create policy "Users manage own sync upload chunks" on public.web_sync_upload_chunks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.web_sync_upload_chunks to authenticated;
