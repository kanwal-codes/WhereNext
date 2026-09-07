-- Supabase Realtime broadcasts row changes via the `supabase_realtime`
-- publication, and postgres_changes filters can only reference columns ON the
-- changed row — not a joined thread_id. So denormalize trip_id onto
-- conversation_messages (backfill + keep-filled trigger), then publish the five
-- trip-scoped tables the workspace listens to.
alter table public.conversation_messages add column if not exists trip_id uuid;

update public.conversation_messages m
  set trip_id = t.trip_id
  from public.conversation_threads t
  where m.thread_id = t.id and m.trip_id is null;

create or replace function public.set_conversation_message_trip_id() returns trigger
language plpgsql as $$
begin
  if new.trip_id is null then
    select trip_id into new.trip_id from public.conversation_threads where id = new.thread_id;
  end if;
  return new;
end; $$;

drop trigger if exists conversation_messages_set_trip_id on public.conversation_messages;
create trigger conversation_messages_set_trip_id before insert on public.conversation_messages
  for each row execute function public.set_conversation_message_trip_id();

-- Add each table to the publication once. `alter publication ... add table`
-- errors if the table is already a member, so guard on pg_publication_tables.
do $$
declare
  tbl text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return; -- not a Supabase database (e.g. plain local Postgres) — nothing to publish to
  end if;
  foreach tbl in array array[
    'trips', 'trip_itinerary_items', 'trip_places', 'trip_preferences', 'trip_decisions', 'conversation_messages'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
