-- Security audit run 1 (2026-11-23), fixes for two findings.
--
-- 1. The "owner or self can remove membership" DELETE policy on trip_members (0008, altered 0020) was never dropped, so a trip
--    owner could delete any member's row through PostgREST. That skips remove_trip_member's last-owner guard and its revocation
--    of pending invites. Removal now goes only through remove_trip_member (owner removes anyone; a member removes themself),
--    which is SECURITY DEFINER and keeps both checks. The app has no direct trip_members DELETE.
drop policy if exists "owner or self can remove membership" on public.trip_members;
revoke delete on public.trip_members from authenticated, anon;

-- 2. accept_trip_invite had no anonymous-session check, so a guest JWT (role authenticated) could join a real trip through
--    PostgREST, bypassing the guest allowlist in middleware. Guests join nothing; they must sign in first (claim flow).
--    Body is the 0038 definition with the guard added.
create or replace function public.accept_trip_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.trip_invites;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'guest sessions cannot join trips'; end if;
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
