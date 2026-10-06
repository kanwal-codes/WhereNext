-- Security audit follow-up: make the database enforce what the route handlers already do.
--
-- The browser holds the publishable key plus the member's JWT, so every table is reachable
-- straight through PostgREST and RLS is the ONLY control on those calls. Several tables had
-- policies that checked membership but not role, ownership or the columns the app treats as
-- server-owned. Nothing here changes what the app legitimately does; it closes direct-write
-- paths the app never uses. Review on a staging database before applying to production.

-- ---------------------------------------------------------------------------------------------
-- Helper: "owner or editor of this trip" (the app's write tier). Lives in `private` for the same
-- reason as is_trip_member/is_trip_owner (0035): policies call it, PostgREST must not expose it.
-- ---------------------------------------------------------------------------------------------
create or replace function private.is_trip_editor(target_trip_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = target_trip_id and user_id = target_user_id and role in ('owner', 'editor')
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- trips: owner-defining and owner-only columns are not writable by the general member UPDATE
-- policy (0037 let any editor rewrite owner_id, share_slug, share_visibility).
--   * UPDATE is limited to the columns the app lets an editor change.
--   * owner_id changes only server-side (claim_guest_trips, and the RPCs below).
--   * share_slug / share_visibility change only through set_trip_share(), owner-only.
-- The updated_at trigger keeps working: column privileges apply to the columns named in the
-- statement, not to a trigger's own assignment.
-- ---------------------------------------------------------------------------------------------
revoke update on public.trips from authenticated, anon;
grant update (name, destination, origin, duration_days, start_date, end_date, travelers, hero_photo_name, splitwise_group_id)
  on public.trips to authenticated;

create or replace function public.set_trip_share(p_trip_id uuid, p_slug text, p_visibility text, p_only_if_unset boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_slug text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not exists (select 1 from public.trip_members where trip_id = p_trip_id and user_id = auth.uid() and role = 'owner') then
    raise exception 'owner role required';
  end if;
  if p_visibility not in ('link', 'private') then raise exception 'invalid visibility'; end if;
  if p_slug is not null and p_slug !~ '^[a-f0-9]{8,64}$' then raise exception 'invalid slug'; end if;

  update public.trips
     set share_slug = p_slug, share_visibility = p_visibility
   where id = p_trip_id and (not p_only_if_unset or share_slug is null)
  returning share_slug into v_slug;
  return v_slug;
end; $$;
revoke execute on function public.set_trip_share(uuid, text, text, boolean) from public, anon;
grant execute on function public.set_trip_share(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Ownership lives in two places: trips.owner_id (read by RLS: is_trip_owner, trips DELETE) and
-- trip_members.role = 'owner' (read by the RPCs and the API). Removing or demoting the creator
-- left owner_id pointing at them, so they kept RLS-owner powers. Keep owner_id on a current
-- owner whenever the creator stops being one.
-- ---------------------------------------------------------------------------------------------
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

  update public.trips t
     set owner_id = (select m.user_id from public.trip_members m where m.trip_id = p_trip_id and m.role = 'owner' order by m.created_at limit 1)
   where t.id = p_trip_id and t.owner_id = p_user_id
     and not exists (select 1 from public.trip_members m where m.trip_id = p_trip_id and m.user_id = p_user_id and m.role = 'owner');
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

  update public.trips t
     set owner_id = (select m.user_id from public.trip_members m where m.trip_id = p_trip_id and m.role = 'owner' order by m.created_at limit 1)
   where t.id = p_trip_id and t.owner_id = p_user_id;

  -- Removing someone else must also kill the join links they could already see (a generic link
  -- stays redeemable until it expires and would let them straight back in). Leaving on your own
  -- does not touch other people's pending links.
  if auth.uid() <> p_user_id then
    delete from public.trip_invites where trip_id = p_trip_id and accepted_at is null;
  end if;
end; $$;

grant execute on function public.change_trip_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_trip_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- trip_members INSERT: the old check (is_trip_owner only) let a trip's owner insert ANY user id
-- as a member without that user's consent (exposing their email/name/profile to the inserter).
-- The app only inserts the creator's own owner row at creation; everyone else joins through
-- accept_trip_invite (security definer) and the RPCs above.
-- ---------------------------------------------------------------------------------------------
drop policy if exists "owners can create membership" on public.trip_members;
create policy "owners can create membership" on public.trip_members
  for insert with check (user_id = (select auth.uid()) and role = 'owner' and private.is_trip_owner(trip_id));

-- ---------------------------------------------------------------------------------------------
-- trip_date_availability: UPDATE must keep the row inside a trip the caller belongs to (INSERT
-- already required it), otherwise a row can be re-pointed at any trip's UUID.
-- ---------------------------------------------------------------------------------------------
drop policy if exists "members can update own availability" on public.trip_date_availability;
create policy "members can update own availability" on public.trip_date_availability
  for update
  using (user_id = (select auth.uid()) and private.is_trip_member(trip_id))
  with check (user_id = (select auth.uid()) and private.is_trip_member(trip_id));

-- ---------------------------------------------------------------------------------------------
-- group_messages: a member's own session may only write plain user rows in the client key
-- namespace. kind 'system'/'expense' and the 'assistant:' idempotency namespace (Roam's reserved
-- reply keys) belong to the service role; the repository prefixes member keys with 'user:'.
-- ---------------------------------------------------------------------------------------------
drop policy if exists "members can insert own group messages" on public.group_messages;
create policy "members can insert own group messages" on public.group_messages
  for insert
  with check (
    role = 'user' and user_id = (select auth.uid())
    and kind in ('text', 'content_share', 'poll')
    and (idempotency_key is null or idempotency_key like 'user:%')
    and private.is_trip_member(trip_id)
  );

drop policy if exists "members can update own group messages" on public.group_messages;
create policy "members can update own group messages" on public.group_messages
  for update
  using (role = 'user' and user_id = (select auth.uid()))
  with check (
    role = 'user' and user_id = (select auth.uid())
    and kind in ('text', 'content_share', 'poll')
    and (idempotency_key is null or idempotency_key like 'user:%')
    and private.is_trip_member(trip_id)
  );

-- ---------------------------------------------------------------------------------------------
-- bookings: a ledger of REAL provider orders. Members read it; only the server (service role,
-- after requireTripMember(editor, registered)) writes it. The old FOR ALL policy let any member
-- forge, rewrite or delete rows, including the provider_reference the cancel route trusts.
-- ---------------------------------------------------------------------------------------------
drop policy if exists "members can access trip bookings" on public.bookings;
create policy "members can read trip bookings" on public.bookings
  for select using (private.is_trip_member(trip_id));

-- ---------------------------------------------------------------------------------------------
-- Telemetry tables: written by the server only (a member-appendable table fed a cross-tenant
-- service-role aggregate that drives the operator's fallback-rate alert).
-- ---------------------------------------------------------------------------------------------
drop policy if exists "members can write ai turn traces" on public.ai_turn_traces;
drop policy if exists "members can write reco events" on public.reco_events;

-- ---------------------------------------------------------------------------------------------
-- trip_invites: owner/editor only, and the row the route would write (created_by is the caller,
-- bounded expiry). Previously any member (even a demoted viewer or a guest) could mint, read and
-- forge invites directly.
-- ---------------------------------------------------------------------------------------------
drop policy if exists "members manage invites" on public.trip_invites;
create policy "editors read invites" on public.trip_invites
  for select using (private.is_trip_editor(trip_id));
create policy "editors create invites" on public.trip_invites
  for insert with check (
    private.is_trip_editor(trip_id)
    and created_by = (select auth.uid())
    and accepted_by is null and accepted_at is null
    and expires_at <= now() + interval '15 days'
  );
create policy "editors delete invites" on public.trip_invites
  for delete using (private.is_trip_editor(trip_id));

-- ---------------------------------------------------------------------------------------------
-- reservation-files bucket: the API enforces role, type, count and path shape; storage enforced
-- almost none of it. Pin MIME types on the bucket, and require the editor tier plus the exact
-- {trip_id}/{reservation_id}/{file} shape for writes and deletes (reads stay member-wide).
-- ---------------------------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
 where id = 'reservation-files';

drop policy if exists "trip members can add reservation files" on storage.objects;
create policy "trip members can add reservation files" on storage.objects
  for insert with check (
    bucket_id = 'reservation-files'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
    and private.is_trip_editor(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "trip members can remove reservation files" on storage.objects;
create policy "trip members can remove reservation files" on storage.objects
  for delete using (
    bucket_id = 'reservation-files'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$'
    and private.is_trip_editor(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------------------------
-- Prompt-input bounds. These columns are interpolated into LLM prompts; the app caps them in
-- its writers but members can also write them directly. NOT VALID: new and updated rows are
-- checked, existing rows are left alone (validate later once the data is known to comply).
-- ---------------------------------------------------------------------------------------------
alter table public.conversation_threads
  add constraint conversation_threads_summary_len check (summary is null or char_length(summary) <= 600) not valid;
alter table public.conversation_messages
  add constraint conversation_messages_content_len check (char_length(content) <= 32000) not valid;
alter table public.trip_preferences
  add constraint trip_preferences_data_size check (pg_column_size(data) <= 32768) not valid;
alter table public.trip_decisions
  add constraint trip_decisions_value_size check (pg_column_size(value) <= 65536) not valid;
alter table public.trip_itinerary_items
  add constraint trip_itinerary_items_title_len check (char_length(title) <= 300) not valid;
