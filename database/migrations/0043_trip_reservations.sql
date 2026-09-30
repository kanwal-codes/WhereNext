-- Everything a trip has reserved that is not a provider order: a second hotel, a train, a tour,
-- a dinner booking, a museum ticket. Entered by hand (or filled in by Roam from a pasted
-- confirmation). Provider orders (Duffel / LiteAPI) stay in `bookings`; the Bookings page merges both.
create table if not exists public.trip_reservations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  kind text not null check (kind in ('stay','flight','train','activity','dining','other')),
  title text not null check (char_length(title) between 1 and 160),
  starts_on date,
  ends_on date,
  start_time text check (start_time is null or start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  place text check (place is null or char_length(place) <= 200),
  confirmation_code text check (confirmation_code is null or char_length(confirmation_code) <= 80),
  amount numeric check (amount is null or amount >= 0),
  currency text check (currency is null or char_length(currency) <= 8),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists trip_reservations_trip_start_idx on public.trip_reservations (trip_id, starts_on);
alter table public.trip_reservations enable row level security;
create policy "members can access trip reservations" on public.trip_reservations for all using (private.is_trip_member(trip_id)) with check (private.is_trip_member(trip_id));
create trigger trip_reservations_set_updated_at before update on public.trip_reservations for each row execute function public.set_updated_at();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_reservations') then
    alter publication supabase_realtime add table public.trip_reservations;
  end if;
end $$;
