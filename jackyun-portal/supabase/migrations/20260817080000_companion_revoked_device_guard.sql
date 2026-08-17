drop policy if exists "Users manage own companion activity" on public.companion_activity_daily;

create policy "Users read own companion activity" on public.companion_activity_daily
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users delete own companion activity" on public.companion_activity_daily
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Active devices insert companion activity" on public.companion_activity_daily
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.companion_devices
      where companion_devices.id = companion_activity_daily.device_id
        and companion_devices.user_id = (select auth.uid())
        and companion_devices.revoked_at is null
    )
  );

create policy "Active devices update companion activity" on public.companion_activity_daily
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.companion_devices
      where companion_devices.id = companion_activity_daily.device_id
        and companion_devices.user_id = (select auth.uid())
        and companion_devices.revoked_at is null
    )
  );
