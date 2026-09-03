-- Cross-trip traveller profile. `profiles` shipped as an id-only stub; give it a
-- `data` jsonb holding the subset of trip preferences that carry between trips
-- (home airport, usual interests / pace / budget / dietary needs). A new trip
-- seeds its preferences from this at creation time. The row is created lazily on
-- the first PUT /api/profile, so an INSERT policy is needed alongside UPDATE.
alter table public.profiles add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
