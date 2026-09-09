-- Group planning: conversation_threads moves from one-per-trip to one-per-(trip,user),
-- so each member gets a private thread with Roam instead of the whole trip sharing one.
-- The group's own shared thread is a separate table (0022_group_chat.sql), not this one.
alter table public.conversation_threads add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- The pre-migration shared thread's history becomes the owner's personal thread;
-- every other member starts a fresh empty personal thread on next use.
update public.conversation_threads t set user_id = tr.owner_id
from public.trips tr where t.trip_id = tr.id and t.user_id is null;

alter table public.conversation_threads alter column user_id set not null;
alter table public.conversation_threads drop constraint if exists conversation_threads_trip_id_key;
alter table public.conversation_threads add constraint conversation_threads_trip_id_user_id_key unique (trip_id, user_id);
create index if not exists conversation_threads_user_id_idx on public.conversation_threads (user_id);

drop policy if exists "members can access conversation threads" on public.conversation_threads;
create policy "members can access own conversation thread" on public.conversation_threads
  for all
  using (public.is_trip_member(trip_id) and user_id = (select auth.uid()))
  with check (public.is_trip_member(trip_id) and user_id = (select auth.uid()));

drop policy if exists "members can access conversation messages" on public.conversation_messages;
create policy "members can access own conversation messages" on public.conversation_messages
  for all
  using (exists (select 1 from public.conversation_threads t where t.id = thread_id and t.user_id = (select auth.uid()) and public.is_trip_member(t.trip_id)))
  with check (exists (select 1 from public.conversation_threads t where t.id = thread_id and t.user_id = (select auth.uid()) and public.is_trip_member(t.trip_id)));
