-- Fixes from the five-friends QA run (docs/qa/five-friends/REPORT.md).
--
-- 1. Account deletion: five foreign keys to auth.users were NO ACTION, so deleting anyone who had ever
--    created a reservation, booking or expense (or accepted an invite) failed. They become SET NULL — the
--    record stays for the group, it just stops naming a deleted person.
-- 2. Owner deletion used to cascade away the whole shared trip. transfer_owned_trips() hands each trip to
--    the longest-standing other member first; only trips with nobody else are deleted with the account.
-- 3. Viewer role: write policies for the trip tables were "any member". Reads stay member-wide, writes
--    now need owner/editor (private.is_trip_editor), so the DB agrees with the API.
-- 4. Reservations: arrival time, destination, cancelled status, traveller count and whether the price is
--    the group total or per person. Round trips become two legs instead of one squashed row.
-- 5. trips.stops: the ordered cities of a multi-city trip ([{ city, startDate, endDate }]).
-- 6. Local (non-Splitwise) expenses: a Splitwise id is no longer mandatory.

-- 1. Delete-safe foreign keys ------------------------------------------------------------------------
alter table public.trip_reservations drop constraint if exists trip_reservations_created_by_fkey;
alter table public.trip_reservations add constraint trip_reservations_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.bookings drop constraint if exists bookings_created_by_fkey;
alter table public.bookings add constraint bookings_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.trip_expenses drop constraint if exists trip_expenses_created_by_fkey;
alter table public.trip_expenses add constraint trip_expenses_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
alter table public.trip_expenses drop constraint if exists trip_expenses_paid_by_fkey;
alter table public.trip_expenses add constraint trip_expenses_paid_by_fkey
  foreign key (paid_by) references auth.users(id) on delete set null;

alter table public.trip_invites drop constraint if exists trip_invites_accepted_by_fkey;
alter table public.trip_invites add constraint trip_invites_accepted_by_fkey
  foreign key (accepted_by) references auth.users(id) on delete set null;

-- 2. Hand a leaving owner's trips to someone else -----------------------------------------------------
create or replace function public.transfer_owned_trips(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip record;
  v_successor uuid;
  v_transferred integer := 0;
  v_orphaned integer := 0;
begin
  for v_trip in select id from public.trips where owner_id = p_user loop
    select user_id into v_successor
      from public.trip_members
      where trip_id = v_trip.id and user_id <> p_user
      order by (role = 'editor') desc, created_at asc
      limit 1;
    if v_successor is null then
      v_orphaned := v_orphaned + 1;
    else
      update public.trips set owner_id = v_successor where id = v_trip.id;
      update public.trip_members set role = 'owner' where trip_id = v_trip.id and user_id = v_successor;
      v_transferred := v_transferred + 1;
    end if;
  end loop;
  return jsonb_build_object('transferred', v_transferred, 'orphaned', v_orphaned);
end; $$;

revoke all on function public.transfer_owned_trips(uuid) from public, anon, authenticated;
grant execute on function public.transfer_owned_trips(uuid) to service_role;

-- 3. Write policies: editors and owners only ----------------------------------------------------------
do $$
declare
  t text;
  old_name text;
  label text;
begin
  for t, old_name, label in
    select * from (values
      ('sources', 'members can access trip sources', 'trip sources'),
      ('trip_decisions', 'members can access trip decisions', 'trip decisions'),
      ('trip_essentials', 'members can access trip essentials', 'trip essentials'),
      ('trip_expenses', 'members can access trip expenses', 'trip expenses'),
      ('trip_itinerary_items', 'members can access itinerary', 'itinerary'),
      ('trip_places', 'members can access trip places', 'trip places'),
      ('trip_polls', 'members can access trip polls', 'trip polls'),
      ('trip_reservations', 'members can access trip reservations', 'trip reservations')
    ) as v(t, old_name, label)
  loop
    execute format('drop policy if exists %I on public.%I', old_name, t);
    execute format('drop policy if exists %I on public.%I', 'members can read ' || label, t);
    execute format('drop policy if exists %I on public.%I', 'editors can insert ' || label, t);
    execute format('drop policy if exists %I on public.%I', 'editors can update ' || label, t);
    execute format('drop policy if exists %I on public.%I', 'editors can delete ' || label, t);
    execute format('create policy %I on public.%I for select using (private.is_trip_member(trip_id))', 'members can read ' || label, t);
    execute format('create policy %I on public.%I for insert with check (private.is_trip_editor(trip_id))', 'editors can insert ' || label, t);
    execute format('create policy %I on public.%I for update using (private.is_trip_editor(trip_id)) with check (private.is_trip_editor(trip_id))', 'editors can update ' || label, t);
    execute format('create policy %I on public.%I for delete using (private.is_trip_editor(trip_id))', 'editors can delete ' || label, t);
  end loop;
end $$;

-- 4. Reservation detail --------------------------------------------------------------------------------
alter table public.trip_reservations
  add column if not exists to_place text,
  add column if not exists end_time text,
  add column if not exists status text not null default 'confirmed',
  add column if not exists travellers integer,
  add column if not exists amount_basis text not null default 'total';

alter table public.trip_reservations drop constraint if exists trip_reservations_to_place_check;
alter table public.trip_reservations add constraint trip_reservations_to_place_check
  check (to_place is null or char_length(to_place) <= 200);
alter table public.trip_reservations drop constraint if exists trip_reservations_end_time_check;
alter table public.trip_reservations add constraint trip_reservations_end_time_check
  check (end_time is null or end_time ~ '^[0-2][0-9]:[0-5][0-9]$');
alter table public.trip_reservations drop constraint if exists trip_reservations_status_check;
alter table public.trip_reservations add constraint trip_reservations_status_check
  check (status in ('confirmed', 'cancelled'));
alter table public.trip_reservations drop constraint if exists trip_reservations_travellers_check;
alter table public.trip_reservations add constraint trip_reservations_travellers_check
  check (travellers is null or (travellers between 1 and 100));
alter table public.trip_reservations drop constraint if exists trip_reservations_amount_basis_check;
alter table public.trip_reservations add constraint trip_reservations_amount_basis_check
  check (amount_basis in ('total', 'per_person'));

-- 5. Multi-city route ----------------------------------------------------------------------------------
alter table public.trips add column if not exists stops jsonb;
alter table public.trips drop constraint if exists trips_stops_check;
alter table public.trips add constraint trips_stops_check
  check (stops is null or (jsonb_typeof(stops) = 'array' and jsonb_array_length(stops) <= 20));
-- 0047 limited UPDATE on trips to a list of columns; the new one has to be added or every route save is refused.
grant update (stops) on public.trips to authenticated;

-- 6. Expenses logged without Splitwise ----------------------------------------------------------------
alter table public.trip_expenses alter column splitwise_expense_id drop not null;
