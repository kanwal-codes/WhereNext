create extension if not exists postgis;

create table if not exists public.profiles (id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
alter table public.profiles enable row level security;
create policy "users can read own profile" on public.profiles for select using (auth.uid() = id);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120), destination text not null check (char_length(destination) between 1 and 160),
  origin text, duration_days integer, travelers integer, preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','editor','viewer')), created_at timestamptz not null default now(), primary key (trip_id,user_id)
);
create index if not exists trips_owner_id_idx on public.trips(owner_id);
create index if not exists trip_members_user_id_idx on public.trip_members(user_id);
alter table public.trips enable row level security; alter table public.trip_members enable row level security;
create or replace function public.is_trip_member(target_trip_id uuid, target_user_id uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.trip_members where trip_id = target_trip_id and user_id = target_user_id); $$;
create or replace function public.is_trip_owner(target_trip_id uuid, target_user_id uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.trips where id = target_trip_id and owner_id = target_user_id); $$;
create policy "trip members can read trips" on public.trips for select using (public.is_trip_member(id));
create policy "users can create trips" on public.trips for insert with check (auth.uid() = owner_id);
create policy "owners can update trips" on public.trips for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create table if not exists public.trip_preferences (trip_id uuid primary key references public.trips(id) on delete cascade, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
alter table public.trip_preferences enable row level security;
create policy "members can read preferences" on public.trip_preferences for select using (public.is_trip_member(trip_id));
create policy "owners can manage preferences" on public.trip_preferences for all using (exists (select 1 from public.trip_members where trip_id = trip_preferences.trip_id and user_id = auth.uid() and role = 'owner')) with check (exists (select 1 from public.trip_members where trip_id = trip_preferences.trip_id and user_id = auth.uid() and role = 'owner'));
create policy "members can read membership" on public.trip_members for select using (auth.uid() = user_id or public.is_trip_member(trip_id));
create policy "owners can create membership" on public.trip_members for insert with check (public.is_trip_owner(trip_id));

create table if not exists public.trip_decisions (id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade, kind text not null, value jsonb not null default '{}'::jsonb, source text not null default 'user' check (source in ('user','assistant','provider')), idempotency_key text, created_at timestamptz not null default now());
create unique index if not exists trip_decisions_idempotency_idx on public.trip_decisions (trip_id, idempotency_key) where idempotency_key is not null;
create index if not exists trip_decisions_trip_created_idx on public.trip_decisions (trip_id, created_at desc);
alter table public.trip_decisions enable row level security;
create policy "members can access trip decisions" on public.trip_decisions for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create table if not exists public.conversation_threads (id uuid primary key default gen_random_uuid(), trip_id uuid not null unique references public.trips(id) on delete cascade, created_at timestamptz not null default now());
create table if not exists public.conversation_messages (id uuid primary key default gen_random_uuid(), thread_id uuid not null references public.conversation_threads(id) on delete cascade, role text not null check (role in ('user','assistant','tool')), content text not null, idempotency_key text, created_at timestamptz not null default now(), unique (thread_id, idempotency_key));
alter table public.conversation_threads enable row level security; alter table public.conversation_messages enable row level security;
create policy "members can access conversation threads" on public.conversation_threads for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy "members can access conversation messages" on public.conversation_messages for all using (exists (select 1 from public.conversation_threads t where t.id = thread_id and public.is_trip_member(t.trip_id))) with check (exists (select 1 from public.conversation_threads t where t.id = thread_id and public.is_trip_member(t.trip_id)));

create table if not exists public.places (id uuid primary key default gen_random_uuid(), provider text not null, provider_id text not null, name text not null, category text, address text, location geography(Point,4326), metadata jsonb not null default '{}'::jsonb, unique(provider,provider_id));
create table if not exists public.trip_places (trip_id uuid not null references public.trips(id) on delete cascade, place_id uuid not null references public.places(id) on delete cascade, status text not null default 'saved' check (status in ('saved','rejected')), created_at timestamptz not null default now(), primary key (trip_id,place_id));
create index if not exists trip_places_place_id_idx on public.trip_places(place_id);
alter table public.places enable row level security; alter table public.trip_places enable row level security;
create policy "members can read places" on public.places for select using (exists (select 1 from public.trip_places tp where tp.place_id = id and public.is_trip_member(tp.trip_id)));
create policy "members can access trip places" on public.trip_places for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create table if not exists public.trip_itinerary_items (id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade, title text not null, day_index integer not null default 1 check (day_index > 0), metadata jsonb not null default '{}'::jsonb, removed_at timestamptz, created_at timestamptz not null default now(), unique (trip_id,title));
alter table public.trip_itinerary_items add column if not exists removed_at timestamptz;
alter table public.trip_itinerary_items enable row level security;
create policy "members can access itinerary" on public.trip_itinerary_items for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create table if not exists public.trip_essentials (trip_id uuid primary key references public.trips(id) on delete cascade, completed text[] not null default '{}', updated_at timestamptz not null default now());
alter table public.trip_essentials enable row level security;
create policy "members can access trip essentials" on public.trip_essentials for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create table if not exists public.sources (id uuid primary key default gen_random_uuid(), trip_id uuid not null references public.trips(id) on delete cascade, entity_type text not null, entity_id text not null, provider text not null, url text, retrieved_at timestamptz not null default now(), expires_at timestamptz, metadata jsonb not null default '{}'::jsonb, unique (trip_id,entity_type,entity_id,provider));
alter table public.sources enable row level security;
create policy "members can access trip sources" on public.sources for all using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at before update on public.trips for each row execute function public.set_updated_at();
drop trigger if exists trip_preferences_set_updated_at on public.trip_preferences;
create trigger trip_preferences_set_updated_at before update on public.trip_preferences for each row execute function public.set_updated_at();
drop trigger if exists trip_essentials_set_updated_at on public.trip_essentials;
create trigger trip_essentials_set_updated_at before update on public.trip_essentials for each row execute function public.set_updated_at();
