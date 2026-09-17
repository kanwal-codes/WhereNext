-- `trips.updated_at` has existed since 0001_core.sql but nothing ever bumped it on write — every
-- caller either omitted it or would have had to remember to set it by hand. Without a value that
-- reliably changes on every update, it's useless as an optimistic-concurrency check: two
-- concurrent trip-fact corrections (a real risk now that group trips let several members trigger
-- an assistant turn that writes to the same trip row) would otherwise race a blind
-- read-modify-write with nothing to detect the conflict.
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at before update on public.trips
  for each row execute function public.set_updated_at();
