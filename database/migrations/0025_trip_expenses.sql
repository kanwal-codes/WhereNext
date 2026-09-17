-- Group planning: logged expenses, backed by Splitwise. Like bookings (0018) not
-- trip_decisions — an expense is a real external record with its own id to keep, not a
-- replaceable intent snapshot. Running balances are NOT cached here; they're fetched live
-- from Splitwise's own /get_group endpoint so this app never drifts from settlements made
-- on the Splitwise side directly.
create table public.trip_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  splitwise_expense_id text not null,
  created_by uuid references auth.users(id),
  description text not null,
  amount numeric not null,
  currency text not null,
  paid_by uuid references auth.users(id),
  split jsonb not null default '{}'::jsonb, -- snapshot {user_id: shareAmount} at creation time
  idempotency_key text,
  created_at timestamptz not null default now()
);
create unique index trip_expenses_trip_idempotency_idx on public.trip_expenses (trip_id, idempotency_key) where idempotency_key is not null;
create index trip_expenses_trip_created_idx on public.trip_expenses (trip_id, created_at desc);
create index trip_expenses_created_by_idx on public.trip_expenses (created_by);
create index trip_expenses_paid_by_idx on public.trip_expenses (paid_by);
alter table public.trip_expenses enable row level security;
create policy "members can access trip expenses" on public.trip_expenses
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
