-- Track the durable point covered by conversation_threads.summary. The summary
-- is a rolling memory, not a replacement for canonical trip facts.
alter table public.conversation_threads
  add column if not exists summarized_through_message_id uuid references public.conversation_messages(id) on delete set null,
  add column if not exists summarized_through_created_at timestamptz;

create index if not exists conversation_messages_thread_created_idx
  on public.conversation_messages (thread_id, created_at, id);
