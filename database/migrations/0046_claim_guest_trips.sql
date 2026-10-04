-- A guest (anonymous session) who signs in to an account that already exists cannot be upgraded in
-- place: the email or Google identity belongs to another user. The server instead moves the guest's
-- trips to that account and throws the guest away. Everything a guest can own is a trip, its
-- membership row and its personal conversation thread; guests are refused everything else (see
-- lib/guest-policy.ts), so those three are the whole move. One transaction: either the trip arrives
-- complete or it stays where it was.
--
-- Callable by the server only (service role). The caller (lib/server/guest-claim.ts) has already
-- proved both sides: a signed ticket from the guest's own session, and the account's own sign-in.
create or replace function public.claim_guest_trips(p_guest uuid, p_account uuid)
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_trips uuid[];
begin
  if p_guest is null or p_account is null or p_guest = p_account then return '{}'; end if;

  -- The update takes the row locks, so a second call for the same guest waits and then finds nothing.
  with moved as (update public.trips set owner_id = p_account where owner_id = p_guest returning id)
  select coalesce(array_agg(id), '{}') into v_trips from moved;
  update public.trip_members set user_id = p_account where user_id = p_guest and trip_id = any(v_trips);
  update public.conversation_threads set user_id = p_account where user_id = p_guest and trip_id = any(v_trips);

  return v_trips;
end;
$$;

revoke all on function public.claim_guest_trips(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_guest_trips(uuid, uuid) to service_role;
