-- Supabase advisor cleanup: pin function search_path, index the foreign keys the
-- linter flagged as uncovered, wrap auth.uid() in RLS policies so it evaluates once
-- per statement instead of once per row, and drop redundant permissive policies.
-- (public.spatial_ref_sys's "RLS disabled" finding is excluded — that table is owned
-- by Supabase's internal supabase_admin role and can't be altered from this project.)

-- --- function_search_path_mutable ---------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$ begin new.updated_at = now(); return new; end; $function$;

create or replace function public.set_conversation_message_trip_id()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.trip_id is null then
    select trip_id into new.trip_id from public.conversation_threads where id = new.thread_id;
  end if;
  return new;
end; $function$;

-- --- unindexed_foreign_keys ------------------------------------------------------
create index if not exists bookings_created_by_idx on public.bookings (created_by);
create index if not exists conversation_threads_summarized_through_message_id_idx on public.conversation_threads (summarized_through_message_id);
create index if not exists trip_invites_accepted_by_idx on public.trip_invites (accepted_by);
create index if not exists trip_invites_created_by_idx on public.trip_invites (created_by);

-- --- auth_rls_initplan -----------------------------------------------------------
-- "users can read own profile" and "co-members can read profiles" aren't altered
-- here — both get dropped and merged into one policy in the next section instead.

alter policy "users can insert own profile" on public.profiles
  with check ((select auth.uid()) = id);

alter policy "users can update own profile" on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy "owners can delete trips" on public.trips
  using ((select auth.uid()) = owner_id);

alter policy "owners can update trips" on public.trips
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

alter policy "users can create trips" on public.trips
  with check ((select auth.uid()) = owner_id);

alter policy "owner or self can remove membership" on public.trip_members
  using (is_trip_owner(trip_id) or (user_id = (select auth.uid())));

alter policy "members can read membership" on public.trip_members
  using ((select auth.uid()) = user_id or is_trip_member(trip_id));

-- "owners can manage preferences" isn't altered either — it's dropped and split into
-- write-only policies in the next section (see: multiple_permissive_policies).

-- --- multiple_permissive_policies -------------------------------------------------
-- profiles: "users can read own profile" already grants self-access; folding it into
-- co-members' condition removes the second permissive SELECT policy entirely instead
-- of running both on every read.
drop policy "co-members can read profiles" on public.profiles;
drop policy "users can read own profile" on public.profiles;
create policy "profile is readable by self or trip co-members" on public.profiles
  for select
  using (
    (select auth.uid()) = id
    or exists (
      select 1 from public.trip_members m_self
      join public.trip_members m_other on m_other.trip_id = m_self.trip_id
      where m_self.user_id = (select auth.uid()) and m_other.user_id = profiles.id
    )
  );

-- trip_preferences: owners are always trip_members rows too, so "members can read
-- preferences" (is_trip_member) already covers owners for SELECT — "owners can manage
-- preferences" only needs to keep write access, not restate SELECT.
drop policy "owners can manage preferences" on public.trip_preferences;
create policy "owners can insert preferences" on public.trip_preferences
  for insert
  with check (exists (select 1 from public.trip_members where trip_members.trip_id = trip_preferences.trip_id and trip_members.user_id = (select auth.uid()) and trip_members.role = 'owner'));
create policy "owners can update preferences" on public.trip_preferences
  for update
  using (exists (select 1 from public.trip_members where trip_members.trip_id = trip_preferences.trip_id and trip_members.user_id = (select auth.uid()) and trip_members.role = 'owner'))
  with check (exists (select 1 from public.trip_members where trip_members.trip_id = trip_preferences.trip_id and trip_members.user_id = (select auth.uid()) and trip_members.role = 'owner'));
create policy "owners can delete preferences" on public.trip_preferences
  for delete
  using (exists (select 1 from public.trip_members where trip_members.trip_id = trip_preferences.trip_id and trip_members.user_id = (select auth.uid()) and trip_members.role = 'owner'));
