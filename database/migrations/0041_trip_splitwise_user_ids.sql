-- Splitwise's `simplified_debts` (get_group_balances) returns pairwise debts keyed by ITS OWN
-- numeric user ids ("from": 123, "to": 456) — the app has no way to turn those back into trip
-- member names without a security-definer lookup, since splitwise_accounts' own RLS ("users
-- manage own splitwise account", only user_id = auth.uid()) blocks a regular member from reading
-- anyone else's row. trip_splitwise_connection_status (0024) already solves the analogous
-- "who's connected" question the same way but only returns a boolean — this returns the actual
-- splitwise_user_id so balances can be resolved to names. Live-caught: the expenses panel's own
-- "Who owes what" card only ever rendered a bare amount ("$42.00 owed") with no name attached,
-- because fromUserId/toUserId had nothing to resolve against — this is what closes that gap.
create or replace function public.trip_splitwise_user_ids(target_trip_id uuid)
returns table(user_id uuid, splitwise_user_id text)
language sql stable security definer set search_path = public as $$
  select m.user_id, sa.splitwise_user_id
  from public.trip_members m
  join public.splitwise_accounts sa on sa.user_id = m.user_id
  where m.trip_id = target_trip_id and private.is_trip_member(target_trip_id);
$$;
