-- 0035's `revoke ... from anon, authenticated` on handle_new_user had no effect: its EXECUTE
-- grant was to the PUBLIC pseudo-role (every role, anon/authenticated included, is implicitly a
-- member of PUBLIC), so revoking from two named roles left the PUBLIC grant — and therefore
-- everyone's access — untouched. The trigger that actually invokes this function (on
-- auth.users insert) doesn't go through ACL-checked RPC calls, so it needs no EXECUTE grant to
-- keep working.
revoke execute on function public.handle_new_user() from public;
