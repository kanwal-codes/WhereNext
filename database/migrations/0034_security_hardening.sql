-- Supabase's security advisor flagged two real, low-risk items after this session's schema
-- changes:
--
-- 1. `function_search_path_mutable` — set_updated_at (pre-existing), reorder_itinerary_items and
--    replace_trip_date_availability (both added this session, 0031/0032) had no explicit
--    search_path. A function without one resolves unqualified names against whatever search_path
--    the CALLING session happens to have — for a plain SECURITY INVOKER function the practical
--    risk is low (an attacker would need the same privileges as the caller already), but pinning
--    search_path is free, standard hardening recommended for every function regardless.
alter function public.set_updated_at() set search_path = public;
alter function public.reorder_itinerary_items(uuid, jsonb) set search_path = public;
alter function public.replace_trip_date_availability(uuid, uuid, jsonb) set search_path = public;

-- 2. `rls_disabled_in_public` — public.spatial_ref_sys (a PostGIS system table, EPSG spatial
-- reference definitions, not application data) has RLS disabled. It's owned by the PostGIS
-- extension, not this app's migration role, so it can't be altered from here — applied instead
-- via the Supabase dashboard/API, which runs as a role with ownership. See qa-findings.md.
