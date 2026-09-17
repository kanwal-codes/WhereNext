-- Invite links used to be owner-only to create, view, or revoke (RLS policy "owners manage
-- invites"), matching a UI that made the owner/editor/viewer split visible everywhere. The group
-- details page no longer surfaces that hierarchy — every member can invite people in, since a
-- shared trip has no "the owner decides who joins" gate a casual friend group actually wants.
-- Membership itself (trip_members) is untouched: only who may mint/revoke a trip_invites row.
drop policy if exists "owners manage invites" on public.trip_invites;
create policy "members manage invites" on public.trip_invites
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
