-- Files attached to a reservation: the ticket PDF, the confirmation screenshot, the voucher photo.
-- Private bucket (these can carry names and passport numbers), one folder per trip, so access
-- follows trip membership: `{trip_id}/{reservation_id}/{file}`. The API hands out short-lived signed links.
alter table public.trip_reservations add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit)
values ('reservation-files', 'reservation-files', false, 10485760)
on conflict (id) do nothing;

create policy "trip members can read reservation files"
  on storage.objects for select
  using (bucket_id = 'reservation-files' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then public.is_trip_member(((storage.foldername(name))[1])::uuid) else false end);

create policy "trip members can add reservation files"
  on storage.objects for insert
  with check (bucket_id = 'reservation-files' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then public.is_trip_member(((storage.foldername(name))[1])::uuid) else false end);

create policy "trip members can remove reservation files"
  on storage.objects for delete
  using (bucket_id = 'reservation-files' and case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then public.is_trip_member(((storage.foldername(name))[1])::uuid) else false end);
