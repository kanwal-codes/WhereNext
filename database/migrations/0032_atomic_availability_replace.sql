-- app/api/trips/[tripId]/availability/route.ts's PUT replaced a member's whole set of date
-- ranges as two separate statements (DELETE then INSERT). A failure between them (a transient
-- network blip, a constraint violation on the insert) left the delete committed and the insert
-- never run — the member's availability silently wiped with nothing to restore, since the
-- request already reported that error to the client rather than the stale-but-intact prior
-- state. Same non-atomicity class already fixed for itinerary reorder (0031) and trip-member
-- role changes (0028): wrap both statements in one plpgsql function so they commit or roll back
-- together.
--
-- Not security definer, same reasoning as 0031 — runs with the CALLING session's own
-- permissions, so the existing RLS policies on trip_date_availability (insert/update/delete only
-- your own rows, is_trip_member check on insert) still apply exactly as before. Only atomicity
-- changes; the trip-membership check itself stays in the route (requireTripMember).
create or replace function public.replace_trip_date_availability(p_trip_id uuid, p_user_id uuid, p_ranges jsonb)
returns setof public.trip_date_availability
language plpgsql as $$
begin
  delete from public.trip_date_availability where trip_id = p_trip_id and user_id = p_user_id;

  return query
    insert into public.trip_date_availability (trip_id, user_id, start_date, end_date)
    select p_trip_id, p_user_id, (x.start_date)::date, (x.end_date)::date
    from jsonb_to_recordset(p_ranges) as x(start_date text, end_date text)
    returning *;
end; $$;

grant execute on function public.replace_trip_date_availability(uuid, uuid, jsonb) to authenticated;
