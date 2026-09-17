-- Bulk itinerary reorder used to run as N sequential, non-transactional per-row UPDATEs
-- (app/api/trips/[tripId]/itinerary/route.ts's PATCH bulk-reorder branch) — a failure partway
-- through (a transient network blip, a request timeout) left the itinerary in a partially-
-- reordered state with no rollback: some items on their new day/position, others still on the
-- old ones, with no way for the client to tell which. Same non-atomicity class already fixed
-- once for trip-member role changes (0028_atomic_owner_guard) — wrapping the same per-row logic
-- in one plpgsql function makes the whole reorder one transaction: either every row moves or
-- none do.
--
-- Not security definer, unlike 0028/0029 — this runs with the CALLING session's own permissions,
-- so the existing RLS policy on trip_itinerary_items (an editor may update their trip's own
-- items) still applies exactly as before. Only atomicity changes here, not authorization; the
-- editor-role check itself stays in the route (requireTripMember), same as today.
create or replace function public.reorder_itinerary_items(p_trip_id uuid, p_order jsonb)
returns void
language plpgsql as $$
declare
  v_row record;
begin
  for v_row in select * from jsonb_to_recordset(p_order) as x(title text, day_index integer, position integer)
  loop
    -- Locked items don't move — checked here (metadata->>'locked') rather than the app
    -- precomputing a locked-title set, since the whole point is one atomic statement per row
    -- instead of a separate read-then-write round trip.
    update public.trip_itinerary_items
      set day_index = v_row.day_index, position = v_row.position
      where trip_id = p_trip_id
        and title = v_row.title
        and removed_at is null
        and coalesce((metadata->>'locked')::boolean, false) = false;
  end loop;
end; $$;

grant execute on function public.reorder_itinerary_items(uuid, jsonb) to authenticated;
