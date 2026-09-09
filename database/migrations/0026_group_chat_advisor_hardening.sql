-- Supabase advisor cleanup for the group-chat migrations: index the FK the linter flagged,
-- and remove the redundant permissive SELECT policy on group_message_reactions — "members can
-- read trip message reactions" already covers a member reading their own reactions (a subset
-- of "any trip member's reactions"), so "members can manage own reactions" only needs to keep
-- write access, mirroring how 0020 split "owners can manage preferences" the same way.
create index if not exists group_message_reactions_user_id_idx on public.group_message_reactions (user_id);

drop policy if exists "members can manage own reactions" on public.group_message_reactions;
create policy "members can insert own reactions" on public.group_message_reactions
  for insert
  with check (user_id = (select auth.uid()) and exists (select 1 from public.group_messages m where m.id = message_id and public.is_trip_member(m.trip_id)));
create policy "members can delete own reactions" on public.group_message_reactions
  for delete
  using (user_id = (select auth.uid()));
