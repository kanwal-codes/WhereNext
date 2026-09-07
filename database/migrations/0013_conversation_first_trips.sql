-- Conversation-first trips start as drafts. Empty core fields are completed by chat.
alter table public.trips alter column destination drop not null;
