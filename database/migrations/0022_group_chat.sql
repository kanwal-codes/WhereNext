-- Group planning: the shared trip-wide chat (all members + Roam). Deliberately a
-- separate table from conversation_messages rather than a role/discriminator on it —
-- 0021 just made conversation_threads' identity "one thread per (trip,user)", and folding
-- group chat back in would re-introduce the exact per-row "which kind of thread is this"
-- ambiguity that migration removed. A trip_id FK alone is group chat's full identity, so
-- there's no group_threads table either (mirrors how conversation_threads.summary was only
-- added once threads got long, in 0014 — a summary/cursor column can be added here later
-- the same way, if this table's length ever demands it).
create table public.group_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, -- null = Roam or a system-generated row
  role text not null default 'user' check (role in ('user','assistant','system')),
  kind text not null default 'text' check (kind in ('text','content_share','expense','system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb, -- content-share card payload, expense summary, @mention target
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (trip_id, idempotency_key)
);
create index group_messages_trip_created_idx on public.group_messages (trip_id, created_at);
create index group_messages_user_id_idx on public.group_messages (user_id);
alter table public.group_messages enable row level security;
create policy "members can access trip group messages" on public.group_messages
  for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create table public.group_message_reactions (
  message_id uuid not null references public.group_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index group_message_reactions_message_idx on public.group_message_reactions (message_id);
alter table public.group_message_reactions enable row level security;
create policy "members can read trip message reactions" on public.group_message_reactions
  for select using (exists (select 1 from public.group_messages m where m.id = message_id and public.is_trip_member(m.trip_id)));
create policy "members can manage own reactions" on public.group_message_reactions
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.group_messages m where m.id = message_id and public.is_trip_member(m.trip_id)));

do $$
declare
  tbl text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach tbl in array array['group_messages', 'group_message_reactions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
