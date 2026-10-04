-- Security hardening found in an audit (none of these was exploitable on its own; each removes a way in that nothing needs).

-- 1. Avatars: a public bucket should hold pictures, of a sane size, and nothing else (the client already checks; this is the server saying it too).
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']
 where id = 'avatars';

-- 2. SECURITY DEFINER functions are for signed-in people. Each already refuses auth.uid() = null; this stops an anonymous caller reaching them at all.
revoke execute on function public.accept_trip_invite(text) from public, anon;
revoke execute on function public.change_trip_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.remove_trip_member(uuid, uuid) from public, anon;
revoke execute on function public.trip_splitwise_connection_status(uuid) from public, anon;
revoke execute on function public.trip_splitwise_user_ids(uuid) from public, anon;
grant execute on function public.accept_trip_invite(text) to authenticated;
grant execute on function public.change_trip_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_trip_member(uuid, uuid) to authenticated;
grant execute on function public.trip_splitwise_connection_status(uuid) to authenticated;
grant execute on function public.trip_splitwise_user_ids(uuid) to authenticated;

-- (PostGIS's public.spatial_ref_sys, reference data the public API keys can write to, is owned by supabase_admin: a migration run as
-- postgres cannot revoke it. Move the extension out of `public`, or ask Supabase support, to close that one.)
