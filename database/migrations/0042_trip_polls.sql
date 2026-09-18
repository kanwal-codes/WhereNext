-- Group decision-making beyond date availability (0023): a lightweight, single-choice poll any
-- member can start ("which hotel?", "which day trip?"), surfaced as a card in group chat rather
-- than a separate page — same reasoning trip_date_availability and group_message_reactions
-- already established (one row per (entity, member, choice), RLS-scoped to the trip).
create table public.trip_polls (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  question text not null check (char_length(question) between 1 and 200),
  -- [{key, label}, ...] — 2 to 6 options, validated app-side (jsonb has no array-length check).
  options jsonb not null,
  created_at timestamptz not null default now()
);
create index trip_polls_trip_id_idx on public.trip_polls (trip_id);
alter table public.trip_polls enable row level security;
create policy "members can access trip polls" on public.trip_polls
  for all using (private.is_trip_member(trip_id)) with check (private.is_trip_member(trip_id));

-- trip_id is denormalized here (not just reachable via poll_id -> trip_polls.trip_id) because
-- Supabase Realtime's postgres_changes filter can only reference a column ON THE CHANGED ROW —
-- same reason migration 0010 denormalized trip_id onto conversation_messages. The vote route
-- always knows its own tripId from the URL, so this is a plain column, not a trigger-maintained
-- one like 0010's (nothing writes here from a path that doesn't already have it in hand).
create table public.trip_poll_votes (
  poll_id uuid not null references public.trip_polls(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_key text not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index trip_poll_votes_trip_id_idx on public.trip_poll_votes (trip_id);
alter table public.trip_poll_votes enable row level security;
create policy "members can read trip poll votes" on public.trip_poll_votes
  for select using (private.is_trip_member(trip_id));
-- Single-choice: changing your vote is an upsert onto the same (poll_id, user_id) row, not a
-- second vote — the primary key alone already guarantees at most one per member per poll.
create policy "members can manage own vote" on public.trip_poll_votes
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.is_trip_member(trip_id));

-- A poll is announced as its own group_messages row (kind 'poll', metadata: {pollId}) so it
-- appears inline where the group is actually deciding, same as every other message.
alter table public.group_messages drop constraint group_messages_kind_check;
alter table public.group_messages add constraint group_messages_kind_check check (kind in ('text','content_share','expense','system','poll'));

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_polls') then
    alter publication supabase_realtime add table public.trip_polls;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_poll_votes') then
    alter publication supabase_realtime add table public.trip_poll_votes;
  end if;
end $$;
