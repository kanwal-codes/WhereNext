-- group_messages' original policy ("for all using is_trip_member with check is_trip_member")
-- only verified trip membership, not row identity — any member's own session could insert a
-- row claiming role='assistant' (impersonating Roam to the whole group) or a user_id that isn't
-- their own. Split into read (any member) / write (only your own role='user' rows); Roam's
-- replies are now written through the service-role client (app/api/trips/[tripId]/group-chat/
-- roam/route.ts), which bypasses RLS entirely, the same way other privileged server writes do.
drop policy if exists "members can access trip group messages" on public.group_messages;

create policy "members can read trip group messages" on public.group_messages
  for select using (public.is_trip_member(trip_id));

create policy "members can insert own group messages" on public.group_messages
  for insert
  with check (role = 'user' and user_id = (select auth.uid()) and public.is_trip_member(trip_id));

-- An idempotent resend (same trip_id + idempotency_key) resolves via the repository's
-- ON CONFLICT DO UPDATE, which RLS treats as an update on the existing row, not a second insert.
create policy "members can update own group messages" on public.group_messages
  for update
  using (role = 'user' and user_id = (select auth.uid()))
  with check (role = 'user' and user_id = (select auth.uid()) and public.is_trip_member(trip_id));
