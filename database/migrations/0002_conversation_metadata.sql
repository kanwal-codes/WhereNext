-- Structured assistant turns: blocks (place cards, comparisons, follow-up chips,
-- clarifying questions), sources, and language ride alongside the message text.
alter table public.conversation_messages add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Rolling conversation summary so long threads keep their earlier context
-- (used from Phase 3 onward).
alter table public.conversation_threads add column if not exists summary text;
