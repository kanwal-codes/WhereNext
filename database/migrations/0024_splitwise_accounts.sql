-- Group planning: per-user Splitwise OAuth connection. A member must connect their own
-- account before they can be added to any expense — no "add by email" fallback. Tokens are
-- app-layer encrypted (lib/server/token-crypto.ts) before being stored here.
create table public.splitwise_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  splitwise_user_id text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now()
);
alter table public.splitwise_accounts enable row level security;
create policy "users manage own splitwise account" on public.splitwise_accounts
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Security-definer read so a trip's expense form can show "who's connected" without any
-- member being able to read another member's stored tokens directly (same shape as
-- is_trip_member/is_trip_owner).
create or replace function public.trip_splitwise_connection_status(target_trip_id uuid)
returns table(user_id uuid, connected boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, (sa.user_id is not null) as connected
  from public.trip_members m left join public.splitwise_accounts sa on sa.user_id = m.user_id
  where m.trip_id = target_trip_id and public.is_trip_member(target_trip_id);
$$;

-- One Splitwise group per trip, created lazily on the trip's first expense.
alter table public.trips add column if not exists splitwise_group_id text;
