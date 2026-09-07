-- The partial unique index from 0001 (`where idempotency_key is not null`) can't be targeted by
-- a plain `ON CONFLICT (trip_id, idempotency_key)` — Postgres only matches an unqualified
-- conflict target against a full index, so every idempotency-keyed trip_decisions upsert in the
-- app (leg_transport choices, AI-proposed facts, stay-area suggestions, the review cron) has been
-- failing with "no unique or exclusion constraint matching the ON CONFLICT specification" (42P10).
-- A plain unique constraint covers the same "dedupe when a key is given" need — Postgres never
-- treats two NULLs as equal, so idempotency_key-less rows still never conflict with each other.
drop index if exists public.trip_decisions_idempotency_idx;
alter table public.trip_decisions add constraint trip_decisions_trip_id_idempotency_key_key unique (trip_id, idempotency_key);
