-- Security audit run-2 (2026-11-23).
--
-- 1. 0047 narrowed the trip_members INSERT policy so an owner can no longer add someone without their consent,
--    but the 0008 UPDATE policy "owners can update membership" still let the owner of record rewrite any row's
--    user_id (another member's row, or their own and then re-add themselves) to any user's id. That planted the
--    person in the trip and exposed their email and profile. Nothing in the app updates trip_members directly:
--    role changes go through change_trip_member_role, removals through remove_trip_member.
drop policy if exists "owners can update membership" on public.trip_members;
revoke update on public.trip_members from authenticated, anon;

-- 2. A member demoted to viewer could redeem a generic invite link they saw as an editor and become editor again.
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

  -- Demoting someone to viewer must also kill the join links they could already see: a generic link stays
  -- redeemable until it expires, and accept_trip_invite upgrades a viewer back to editor. Same rule as
  -- remove_trip_member.
  if p_new_role = 'viewer' and p_user_id <> auth.uid() then
    delete from public.trip_invites where trip_id = p_trip_id and accepted_at is null;
  end if;

  update public.trips t
     set owner_id = (select m.user_id from public.trip_members m where m.trip_id = p_trip_id and m.role = 'owner' order by m.created_at limit 1)
   where t.id = p_trip_id and t.owner_id = p_user_id
     and not exists (select 1 from public.trip_members m where m.trip_id = p_trip_id and m.user_id = p_user_id and m.role = 'owner');
end; $$;

grant execute on function public.change_trip_member_role(uuid, uuid, text) to authenticated;
