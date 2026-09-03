-- Link-based trip invites. The owner mints a token; anyone signed in who has the
-- link calls accept_trip_invite(token) to join. No email — the API returns the
-- link for the owner to share.
create table if not exists public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  token text not null unique,
  role text not null check (role in ('editor', 'viewer')),
  email text,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists trip_invites_trip_id_idx on public.trip_invites (trip_id);
alter table public.trip_invites enable row level security;

drop policy if exists "owners manage invites" on public.trip_invites;
create policy "owners manage invites" on public.trip_invites
  for all using (public.is_trip_owner(trip_id)) with check (public.is_trip_owner(trip_id));

-- Security definer so an invitee (not yet a member, can't see the row) can redeem it.
create or replace function public.accept_trip_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.trip_invites;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select * into v_invite from public.trip_invites where token = p_token for update;
  if v_invite.id is null then raise exception 'invite not found'; end if;
  if v_invite.accepted_at is not null then raise exception 'invite already used'; end if;
  if v_invite.expires_at < now() then raise exception 'invite expired'; end if;

  insert into public.trip_members (trip_id, user_id, role)
    values (v_invite.trip_id, v_uid, v_invite.role)
    on conflict (trip_id, user_id) do nothing;
  update public.trip_invites set accepted_by = v_uid, accepted_at = now() where id = v_invite.id;
  return v_invite.trip_id;
end; $$;
