-- Closes the owner-race fully: the app-layer fix in members/[userId]/route.ts (pre-check +
-- post-write verify-and-revert) narrows the window but can't close it — two concurrent
-- demotions/removals of different owners can each pass their own read before either write
-- lands. These functions do the owner-count check and the write in one transaction, holding a
-- row lock on the trip's whole membership set for its duration, so a second concurrent call for
-- the same trip blocks until the first commits and sees the post-write state.
--
-- security definer, so each function does its own auth.uid()-based authorization inside — same
-- shape as accept_trip_invite (0009) — since Supabase exposes security-definer functions to any
-- authenticated caller via RPC, bypassing RLS and the app's own route-level checks entirely if
-- the function didn't check itself.
create or replace function public.change_trip_member_role(p_trip_id uuid, p_user_id uuid, p_new_role text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caller_role text;
  v_current_role text;
  v_owner_count int;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_new_role not in ('owner', 'editor', 'viewer') then raise exception 'invalid role'; end if;

  perform 1 from public.trip_members where trip_id = p_trip_id for update;

  select role into v_caller_role from public.trip_members where trip_id = p_trip_id and user_id = auth.uid();
  if v_caller_role is distinct from 'owner' then raise exception 'owner role required'; end if;

  select role into v_current_role from public.trip_members where trip_id = p_trip_id and user_id = p_user_id;
  if v_current_role is null then raise exception 'not a member of this trip'; end if;

  if v_current_role = 'owner' and p_new_role <> 'owner' then
    select count(*) into v_owner_count from public.trip_members where trip_id = p_trip_id and role = 'owner';
    if v_owner_count <= 1 then raise exception 'the trip needs at least one owner'; end if;
  end if;

  update public.trip_members set role = p_new_role where trip_id = p_trip_id and user_id = p_user_id;
end; $$;

create or replace function public.remove_trip_member(p_trip_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_caller_role text;
  v_current_role text;
  v_owner_count int;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  perform 1 from public.trip_members where trip_id = p_trip_id for update;

  select role into v_caller_role from public.trip_members where trip_id = p_trip_id and user_id = auth.uid();
  if v_caller_role is null then raise exception 'not a member of this trip'; end if;
  if auth.uid() <> p_user_id and v_caller_role <> 'owner' then
    raise exception 'only the owner can remove other people';
  end if;

  select role into v_current_role from public.trip_members where trip_id = p_trip_id and user_id = p_user_id;
  if v_current_role is null then raise exception 'not a member of this trip'; end if;

  if v_current_role = 'owner' then
    select count(*) into v_owner_count from public.trip_members where trip_id = p_trip_id and role = 'owner';
    if v_owner_count <= 1 then raise exception 'the trip needs at least one owner'; end if;
  end if;

  delete from public.trip_members where trip_id = p_trip_id and user_id = p_user_id;
end; $$;

grant execute on function public.change_trip_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_trip_member(uuid, uuid) to authenticated;
