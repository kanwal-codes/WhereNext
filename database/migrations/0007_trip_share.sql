-- Public share links. A trip is private by default; the owner can flip it to
-- 'link' visibility, which mints an unguessable slug. RLS stays strict — there
-- is NO anon policy. Public pages read through the service-role client in
-- lib/server/public-trip.ts, filtered to share_visibility = 'link'.
alter table public.trips add column if not exists share_slug text unique;
alter table public.trips add column if not exists share_visibility text not null default 'private'
  check (share_visibility in ('private', 'link'));
create index if not exists trips_share_slug_idx on public.trips (share_slug) where share_slug is not null;
