-- Two real mismatches between what the app already lets non-owner members do and what the
-- database actually allows, found while reviewing the RLS policy list end to end:
--
-- 1. trip_preferences: INSERT/UPDATE/DELETE were restricted to role = 'owner', but
--    app/api/commands/route.ts's update_preferences and app/api/trips/[tripId]/suggestions/
--    route.ts both already call requireTripMember(tripId, { role: "editor" }) — the app's own
--    code has assumed editors can write preferences since before this session. Every write from
--    a non-owner editor was silently rejected by RLS (0 rows affected on UPDATE, a thrown
--    violation on INSERT) while the app had no reason to suspect a permissions problem — the
--    generic CAS retry-then-give-up path in updateTripPreferences would eventually surface this
--    as "lost the concurrency race", masking the real cause entirely.
--
-- 2. trips: UPDATE was restricted to owner_id = auth.uid(), but app/api/trips/[tripId]/route.ts's
--    PATCH (trip identity — name/destination/dates/travelers/photo) already calls
--    requireTripMember(tripId, { role: "editor" }), and the chat-driven trip-update path
--    (lib/application/orchestrate/trip-update-handling.ts's applyTripUpdate, reachable from
--    group chat's @Roam with NO role gate at all — see group-chat/roam/route.ts's plain
--    requireTripMember(tripId)) assumes ANY member can direct a trip-fact change through
--    conversation. A non-owner member asking @Roam to change the destination would get a normal
--    reply with no error, while the actual database write silently never happened.
--
-- Both now match role in ('owner', 'editor') — the same bar PATCH already enforces at the app
-- layer, and consistent with invites always granting 'editor' (0033) since 'viewer' is no longer
-- a role any new member actually has. DELETE on trips stays owner-only (matches
-- app/api/trips/[tripId]/route.ts's DELETE, which does require role: "owner") — deleting the
-- whole trip is a meaningfully more destructive action than editing its facts, and no code path
-- lets a non-owner attempt it, so no mismatch exists there.

drop policy if exists "owners can insert preferences" on public.trip_preferences;
create policy "members can insert preferences" on public.trip_preferences
  for insert with check (exists (
    select 1 from public.trip_members
    where trip_members.trip_id = trip_preferences.trip_id
      and trip_members.user_id = (select auth.uid())
      and trip_members.role in ('owner', 'editor')
  ));

drop policy if exists "owners can update preferences" on public.trip_preferences;
create policy "members can update preferences" on public.trip_preferences
  for update using (exists (
    select 1 from public.trip_members
    where trip_members.trip_id = trip_preferences.trip_id
      and trip_members.user_id = (select auth.uid())
      and trip_members.role in ('owner', 'editor')
  )) with check (exists (
    select 1 from public.trip_members
    where trip_members.trip_id = trip_preferences.trip_id
      and trip_members.user_id = (select auth.uid())
      and trip_members.role in ('owner', 'editor')
  ));

drop policy if exists "owners can delete preferences" on public.trip_preferences;
create policy "members can delete preferences" on public.trip_preferences
  for delete using (exists (
    select 1 from public.trip_members
    where trip_members.trip_id = trip_preferences.trip_id
      and trip_members.user_id = (select auth.uid())
      and trip_members.role in ('owner', 'editor')
  ));

drop policy if exists "owners can update trips" on public.trips;
create policy "members can update trips" on public.trips
  for update using (exists (
    select 1 from public.trip_members
    where trip_members.trip_id = trips.id
      and trip_members.user_id = (select auth.uid())
      and trip_members.role in ('owner', 'editor')
  )) with check (exists (
    select 1 from public.trip_members
    where trip_members.trip_id = trips.id
      and trip_members.user_id = (select auth.uid())
      and trip_members.role in ('owner', 'editor')
  ));
