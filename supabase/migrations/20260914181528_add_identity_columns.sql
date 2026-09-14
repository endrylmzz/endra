-- Lookup columns for CORE-003/004 identity resolution: given a channel-
-- scoped external id from an inbound request, find-or-create the
-- matching internal user/conversation row.

alter table public.users add column if not exists external_id text;

create unique index if not exists users_external_id_key on public.users (external_id)
where external_id is not null;

create unique index if not exists conversations_external_conv_key on public.conversations (
  user_id,
  channel,
  external_conversation_id
)
where external_conversation_id is not null;
