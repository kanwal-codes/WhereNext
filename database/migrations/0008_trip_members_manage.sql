-- trip_members shipped with SELECT + INSERT policies only. Collaboration needs
-- the owner to change roles and remove people, and a member to leave. Also let
-- co-members read each other's profile rows so names/avatars resolve.
drop policy if exists "owners can update membership" on public.trip_members;
create policy "owners can update membership" on public.trip_members
  for update using (public.is_trip_owner(trip_id)) with check (public.is_trip_owner(trip_id));

drop policy if exists "owner or self can remove membership" on public.trip_members;
create policy "owner or self can remove membership" on public.trip_members
  for delete using (public.is_trip_owner(trip_id) or user_id = auth.uid());

drop policy if exists "co-members can read profiles" on public.profiles;
create policy "co-members can read profiles" on public.profiles
  for select using (
    exists (
      select 1
      from public.trip_members m_self
      join public.trip_members m_other on m_other.trip_id = m_self.trip_id
      where m_self.user_id = auth.uid() and m_other.user_id = profiles.id
    )
  );
