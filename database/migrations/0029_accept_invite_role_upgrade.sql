-- Fault Lines low-severity finding: accepting an invite as an existing member did nothing
-- (`on conflict ... do nothing`) — a viewer redeeming a fresh editor invite stayed a viewer,
-- with the invite silently marked accepted anyway. Upgrade on conflict when the incoming role
-- is a genuine promotion (viewer -> editor); never downgrade an existing editor or owner.
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
    on conflict (trip_id, user_id) do update
      set role = excluded.role
      where public.trip_members.role = 'viewer' and excluded.role = 'editor';
  update public.trip_invites set accepted_by = v_uid, accepted_at = now() where id = v_invite.id;
  return v_invite.trip_id;
end; $$;
