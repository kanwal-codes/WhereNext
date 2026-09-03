-- One queryable row per assistant turn: intent, the tools the router chose, which
-- providers failed, which blocks were rendered, token/cost accounting, per-stage
-- latency, and which model ran each stage. Feeds regression dashboards and the
-- RESOLVE model-swap decision. Written best-effort by POST /api/ai; a missing row
-- never affects a turn.
create table if not exists public.ai_turn_traces (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_at timestamptz not null default now(),
  intent text,
  tools text[] not null default '{}',
  providers_failed text[] not null default '{}',
  blocks text[] not null default '{}',
  tokens_in integer,
  tokens_out integer,
  cost_usd numeric,
  resolve_ms integer,
  retrieve_ms integer,
  compose_ms integer,
  total_ms integer,
  model_resolve text,
  model_compose text,
  degraded boolean not null default false
);

create index if not exists ai_turn_traces_trip_created_idx
  on public.ai_turn_traces (trip_id, created_at desc);

alter table public.ai_turn_traces enable row level security;

-- Diagnostic, member-visible, low-stakes: a member may read and append rows for
-- their own trips (the route already writes with the user-scoped client), nothing more.
create policy "members can read ai turn traces" on public.ai_turn_traces
  for select using (public.is_trip_member(trip_id));
create policy "members can write ai turn traces" on public.ai_turn_traces
  for insert with check (public.is_trip_member(trip_id));
