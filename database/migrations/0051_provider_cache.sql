-- Second-level cache for provider responses that are safe to keep for days (see lib/server/provider-store.ts).
-- Redis / memory stay the fast layer; this survives restarts and serverless cold starts. Server-only: RLS on, no policies.
create table if not exists public.provider_cache (
  key text primary key,
  provider text not null,
  value jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  hits integer not null default 0
);
create index if not exists provider_cache_expires_idx on public.provider_cache (expires_at);
create index if not exists provider_cache_provider_idx on public.provider_cache (provider, fetched_at desc);
alter table public.provider_cache enable row level security;
