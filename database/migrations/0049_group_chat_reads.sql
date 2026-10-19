-- Group chat unread (phone redesign, docs/design/phone-redesign-plan.md, phase 2): one row per member and trip holding when
-- that member last had the group chat open. Unread is "messages from other people since then". A member with no row yet is
-- measured from when they joined the trip, so turning this on does not show everyone a pile of old messages as new.
create table public.group_chat_reads (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
alter table public.group_chat_reads enable row level security;
-- Your own marker only, and only on a trip you belong to (the same shape as the other per-member tables, 0047).
create policy "members read own group chat marker" on public.group_chat_reads
  for select using (user_id = (select auth.uid()) and private.is_trip_member(trip_id));
create policy "members write own group chat marker" on public.group_chat_reads
  for insert with check (user_id = (select auth.uid()) and private.is_trip_member(trip_id));
create policy "members move own group chat marker" on public.group_chat_reads
  for update using (user_id = (select auth.uid()) and private.is_trip_member(trip_id))
  with check (user_id = (select auth.uid()) and private.is_trip_member(trip_id));

-- The count is taken in the database so the client never downloads the messages just to count them. Security invoker: it
-- sees exactly what the caller's row-level policies allow, so a non-member gets zero.
create or replace function public.group_chat_unread(p_trip_id uuid) returns integer
language sql stable security invoker set search_path = public as $$
  select count(*)::integer
  from public.group_messages m
  where m.trip_id = p_trip_id
    and m.created_at > coalesce(
      (select r.last_read_at from public.group_chat_reads r where r.trip_id = p_trip_id and r.user_id = (select auth.uid())),
      (select tm.created_at from public.trip_members tm where tm.trip_id = p_trip_id and tm.user_id = (select auth.uid())),
      now()
    )
    and m.user_id is distinct from (select auth.uid());
$$;
revoke execute on function public.group_chat_unread(uuid) from public, anon;
grant execute on function public.group_chat_unread(uuid) to authenticated;
