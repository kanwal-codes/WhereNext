-- The whole of a Roam turn, kept so it can be replayed: what was asked, what the router decided, what the providers returned,
-- the prompt the writer saw and the reply (scripts/replay-turns.ts). ai_turn_traces keeps only counts and timings.
-- Server-only (RLS on, no policies). Written only when recording is on (lib/server/ai-turn-record.ts).
create table if not exists public.ai_turn_records (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('ready', 'declined', 'clarify', 'ungrounded')),
  prompt text not null,
  history jsonb not null default '[]'::jsonb,
  trip_summary text,
  resolved jsonb not null,
  tool_plan jsonb,
  evidence jsonb,
  system_prompt text,
  reply text,
  blocks text[] not null default '{}'::text[]
);
create index if not exists ai_turn_records_trip_idx on public.ai_turn_records (trip_id, created_at desc);
create index if not exists ai_turn_records_created_idx on public.ai_turn_records (created_at desc);
alter table public.ai_turn_records enable row level security;
