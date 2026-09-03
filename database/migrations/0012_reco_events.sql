-- One row per recommendation impression or click on a detail page. Feeds the
-- "which lanes / vibes actually convert" analysis that tunes the lane table and
-- the semantic-rank weight. Written best-effort by POST /api/trips/:id/reco
-- (op: "log"); a missing row never affects what the user sees.
create table if not exists public.reco_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- what the user was looking at
  anchor_kind text not null,          -- 'place' | 'event'
  anchor_id text not null,            -- Google providerId or ticket URL
  vibe text not null,
  -- the lane the item sat in, and the item itself
  lane_id text not null,
  action text not null,               -- 'impression' | 'click'
  item_kind text not null,            -- 'place' | 'event'
  item_id text not null,              -- Google providerId or event URL
  position integer                    -- 0-based index within the lane
);

create index if not exists reco_events_trip_created_idx
  on public.reco_events (trip_id, created_at desc);
create index if not exists reco_events_vibe_lane_idx
  on public.reco_events (vibe, lane_id, action);

alter table public.reco_events enable row level security;

-- Same posture as ai_turn_traces: member-visible, member-appendable, nothing else.
create policy "members can read reco events" on public.reco_events
  for select using (public.is_trip_member(trip_id));
create policy "members can write reco events" on public.reco_events
  for insert with check (public.is_trip_member(trip_id));
