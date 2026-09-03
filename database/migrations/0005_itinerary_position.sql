-- Explicit ordering for itinerary items within a day, so the user can drag them
-- into any order (not just by creation time). Existing rows keep position 0 and
-- fall back to created_at ordering until they're first moved.
alter table public.trip_itinerary_items
  add column if not exists position integer not null default 0;

create index if not exists trip_itinerary_items_order_idx
  on public.trip_itinerary_items (trip_id, day_index, position);
