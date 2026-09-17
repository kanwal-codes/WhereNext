-- trip_members had no realtime publication entry AND no TABLE_TO_CHANGE mapping at all — the one
-- workspace slice with zero live-update path. A friend joining via the invite link (now
-- reusable, 0038), a role change, or someone leaving never reached another member's already-open
-- group chat, member badge, or @mention list; only a full reload picked it up. Paired with the
-- new `trip_members: "members"` entry in trip-realtime.ts's TABLE_TO_CHANGE and useTripMembers's
-- new subscription to that change.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_members'
  ) then
    alter publication supabase_realtime add table public.trip_members;
  end if;
end $$;
