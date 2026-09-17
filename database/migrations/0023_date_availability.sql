-- Group planning: each member's own date-availability ranges. Purely informational —
-- overlap is computed at read time from these rows (features/availability/domain/overlap.ts),
-- never written back here. trips.start_date/end_date (already nullable, added in 0004)
-- stay the single explicit "locked" dates, set independently via a separate action.
create table public.trip_date_availability (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  created_at timestamptz not null default now()
);
create index trip_date_availability_trip_idx on public.trip_date_availability (trip_id);
create index trip_date_availability_user_id_idx on public.trip_date_availability (user_id);
alter table public.trip_date_availability enable row level security;
create policy "members can read trip availability" on public.trip_date_availability
  for select using (public.is_trip_member(trip_id));
create policy "members can insert own availability" on public.trip_date_availability
  for insert with check (public.is_trip_member(trip_id) and user_id = (select auth.uid()));
create policy "members can update own availability" on public.trip_date_availability
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "members can delete own availability" on public.trip_date_availability
  for delete using (user_id = (select auth.uid()));

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_date_availability') then
      alter publication supabase_realtime add table public.trip_date_availability;
    end if;
  end if;
end $$;
