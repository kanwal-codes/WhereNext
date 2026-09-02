-- The trips table shipped with SELECT / INSERT / UPDATE policies but no DELETE
-- policy. With RLS enabled that means an owner's "delete trip" was silently
-- denied by Postgres (0 rows affected, no error), so the API returned 204 while
-- the trip and all its data stayed in the database.
--
-- Allow the owner to delete their own trip. Every trip-scoped table
-- (trip_members, trip_preferences, trip_decisions, conversation_threads ->
-- conversation_messages, trip_places, trip_itinerary_items, trip_essentials,
-- sources) has `on delete cascade` on its FK to trips(id), and cascades run with
-- table-owner privileges, so removing the trips row removes everything with it.
-- The shared `places` catalog is intentionally not trip-scoped and is left alone;
-- its per-trip `trip_places` join rows do cascade away.
drop policy if exists "owners can delete trips" on public.trips;
create policy "owners can delete trips" on public.trips
  for delete using (auth.uid() = owner_id);
