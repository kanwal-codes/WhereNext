-- InviteToGroup's own copy promises "Anyone with this link can join the trip, until <date>" for
-- the generic (no addressed email) share link — but accept_trip_invite has always been strictly
-- single-use: the first person to redeem ANY invite sets accepted_at, and every check since
-- (0009, 0029) has treated that as terminal for every invite alike. A second friend hitting the
-- same generic link saw "This invite can't be used" (app/join/[token]/page.tsx), and the owner
-- reopening the Invite panel later silently minted a brand-new token/URL (the GET route's
-- `.is("accepted_at", null)` filter no longer found the old one) — so the link didn't just stop
-- working, it quietly changed under the owner too.
--
-- Fix: only an invite addressed to one specific email stays single-use (forwarding a personal
-- invite to someone else was never the intended path, and it should still drop off the "invites
-- you sent" list once that person joins). A generic link never records accepted_at at all, so it
-- stays valid — and stays the SAME link, since GET keeps finding it — for anyone who has it,
-- until it naturally expires.
create or replace function public.accept_trip_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.trip_invites;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select * into v_invite from public.trip_invites where token = p_token for update;
  if v_invite.id is null then raise exception 'invite not found'; end if;
  if v_invite.email is not null and v_invite.accepted_at is not null then
    raise exception 'invite already used';
  end if;
  if v_invite.expires_at < now() then raise exception 'invite expired'; end if;

  insert into public.trip_members (trip_id, user_id, role)
    values (v_invite.trip_id, v_uid, v_invite.role)
    on conflict (trip_id, user_id) do update
      set role = excluded.role
      where public.trip_members.role = 'viewer' and excluded.role = 'editor';

  if v_invite.email is not null then
    update public.trip_invites set accepted_by = v_uid, accepted_at = now() where id = v_invite.id;
  end if;
  return v_invite.trip_id;
end; $$;
