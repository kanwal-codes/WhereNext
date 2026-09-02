-- Real trip dates. `duration_days` stays (computed from the pair when both are
-- set) so everything downstream keeps working; dates are null when the traveller
-- only knows the trip length.
alter table public.trips add column if not exists start_date date;
alter table public.trips add column if not exists end_date date;
