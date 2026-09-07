-- Real provider orders (Duffel flights, LiteAPI stays), distinct from trip_decisions:
-- a booking has its own lifecycle (pending/confirmed/failed/cancelled) and a supplier
-- confirmation reference to keep, where a decision is just a replaceable intent snapshot.
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  kind text not null check (kind in ('flight','stay')),
  provider text not null check (provider in ('duffel','liteapi')),
  status text not null default 'pending' check (status in ('pending','confirmed','failed','cancelled')),
  provider_reference text,
  confirmation_code text,
  currency text,
  total_amount numeric,
  raw jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bookings_trip_created_idx on public.bookings (trip_id, created_at desc);
-- Plain constraint, not a partial index — see 0016 for why ON CONFLICT needs this shape.
alter table public.bookings add constraint bookings_trip_id_idempotency_key_key unique (trip_id, idempotency_key);
alter table public.bookings enable row level security;
create policy "members can access trip bookings" on public.bookings for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create trigger bookings_set_updated_at before update on public.bookings for each row execute function public.set_updated_at();
