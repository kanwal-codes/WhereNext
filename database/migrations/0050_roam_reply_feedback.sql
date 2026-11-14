-- Thumbs up / down on Roam's replies in the personal trip chat. One row per (reply, person): a re-tap updates it, clearing deletes it.
-- Feeds the Roam eval review set (scripts/export-feedback.ts turns down-rated replies into reviewable cases).
-- The reply is a conversation_messages row; ai_turn_traces carries no message id, so the export pairs the trace by trip + time.
create table if not exists public.roam_reply_feedback (
  message_id uuid not null references public.conversation_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  rating text not null check (rating in ('up', 'down')),
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists roam_reply_feedback_trip_rating_idx on public.roam_reply_feedback (trip_id, rating, created_at desc);
create index if not exists roam_reply_feedback_user_idx on public.roam_reply_feedback (user_id);

alter table public.roam_reply_feedback enable row level security;

-- Trip members can read the trip's feedback; only the author writes their own row. The write checks also prove the
-- message is a reply in this trip: conversation_messages' own policy only lets you see your own thread's rows.
create policy "members read reply feedback" on public.roam_reply_feedback
  for select using (private.is_trip_member(trip_id));
create policy "authors write own reply feedback" on public.roam_reply_feedback
  for insert with check (
    user_id = (select auth.uid()) and private.is_trip_member(trip_id)
    and exists (select 1 from public.conversation_messages m where m.id = message_id and m.trip_id = roam_reply_feedback.trip_id and m.role = 'assistant')
  );
create policy "authors change own reply feedback" on public.roam_reply_feedback
  for update using (user_id = (select auth.uid()) and private.is_trip_member(trip_id))
  with check (user_id = (select auth.uid()) and private.is_trip_member(trip_id));
create policy "authors clear own reply feedback" on public.roam_reply_feedback
  for delete using (user_id = (select auth.uid()) and private.is_trip_member(trip_id));
