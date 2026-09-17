-- trip-realtime.ts's TABLE_TO_CHANGE subscribes to postgres_changes on trips, bookings,
-- trip_essentials and trip_expenses (each mapped to a WorkspaceChange the UI refetches on), but
-- none of the four were ever actually in the supabase_realtime publication in production —
-- confirmed directly against pg_publication_rel. trips SHOULD have been added by migration 0010,
-- but isn't; bookings/trip_essentials/trip_expenses were added to the app after 0010 and never
-- got their own publication entry. The subscription silently never fires for any of them: a
-- collaborator changing the trip's destination/dates/travelers, booking a flight/hotel, editing
-- the packing checklist, or adding an expense never reaches another member's already-open tab —
-- only a manual reload picks it up.
do $$
declare
  tbl text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach tbl in array array['trips', 'bookings', 'trip_essentials', 'trip_expenses'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
