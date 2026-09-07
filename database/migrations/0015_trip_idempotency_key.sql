-- A stable client-generated key so retrying "Start planning" after a lost response
-- (request succeeded server-side, client never saw it) doesn't create a second blank
-- trip. Mirrors the idempotency_key pattern already used by conversation_messages and
-- trip_decisions. Partial unique index: only enforced when a key is actually supplied,
-- so trips created without one (import, etc.) are never deduped against each other.
alter table public.trips add column if not exists idempotency_key text;
create unique index if not exists trips_owner_idempotency_key_idx
  on public.trips (owner_id, idempotency_key) where idempotency_key is not null;
