-- is_trip_member/is_trip_owner/is_trip_conversation_member exist only to be called FROM RLS
-- policies (`using (is_trip_member(trip_id))`), always implicitly checking auth.uid() via their
-- own default parameter. But every function in `public` is auto-exposed by PostgREST as a REST
-- RPC endpoint regardless of intent, and these three take an EXPLICIT target_user_id parameter
-- that overrides that default — so anyone (the ACL even includes `anon`, i.e. signed-out
-- visitors) could call e.g. /rest/v1/rpc/is_trip_member with an arbitrary trip_id + user_id and
-- get back whether that person belongs to that trip. Only a boolean relationship leaks, not trip
-- content, and it needs guessable UUIDs — low real risk — but it's a real boundary violation of
-- what these were meant to expose, flagged by Supabase's own security advisor.
--
-- The fix is moving them out of `public` into a schema PostgREST doesn't scan for RPC exposure,
-- NOT revoking EXECUTE from authenticated/anon — revoking would break every RLS policy that
-- calls them for those roles (privilege checks apply to the actual invocation, not just the
-- public-facing route). RLS policies themselves need no changes: `CREATE POLICY` compiles its
-- USING/WITH CHECK expression into a parse tree bound to the function's OID at creation time
-- (same mechanism as a view referencing a function), so relocating the function afterwards
-- doesn't touch already-created policies — confirmed no application code calls these three by
-- name via `.rpc(...)` either, so nothing outside RLS depends on their current location.
create schema if not exists private;
grant usage on schema private to authenticated, anon, service_role;

alter function public.is_trip_member(uuid, uuid) set schema private;
alter function public.is_trip_owner(uuid, uuid) set schema private;
alter function public.is_trip_conversation_member(uuid, uuid) set schema private;

-- Unlike RLS policies, a plpgsql/sql function's body is re-resolved by name on every call — the
-- one caller that explicitly schema-qualified these (`public.is_trip_member(...)`) needs its own
-- reference updated, or it breaks the moment the function it calls is no longer in `public`.
create or replace function public.trip_splitwise_connection_status(target_trip_id uuid)
returns table(user_id uuid, connected boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, (sa.user_id is not null) as connected
  from public.trip_members m left join public.splitwise_accounts sa on sa.user_id = m.user_id
  where m.trip_id = target_trip_id and private.is_trip_member(target_trip_id);
$$;

-- handle_new_user is a trigger function (reads `new`, only valid inside trigger execution) —
-- calling it directly via /rest/v1/rpc/handle_new_user always errors regardless of grants, so
-- this is pure hygiene, not a real exploit: no legitimate reason for anon/authenticated to have
-- EXECUTE on it at all.
revoke execute on function public.handle_new_user() from anon, authenticated;
