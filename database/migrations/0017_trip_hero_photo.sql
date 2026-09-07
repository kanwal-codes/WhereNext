-- The Overview page's hero image comes from a Google Places text-search on the destination —
-- previously re-run every session/device (only cached client-side in sessionStorage). Persisting
-- the resolved photo reference here means it's looked up once per trip, ever.
alter table public.trips add column if not exists hero_photo_name text;
