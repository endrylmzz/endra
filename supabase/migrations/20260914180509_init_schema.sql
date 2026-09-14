-- ENDRA initial schema: users, conversations, messages.
-- Minimal slice for CORE-003/004 (user identity, conversation context) -
-- memory-specific tables (memories, embeddings, projects, tasks,
-- tool_runs, agent_runs, approvals, scheduled_jobs) are added in later
-- migrations as those features (MEMORY-004 onward) are actually built.
-- See docs/decisions/ADR-002-supabase-for-memory.md.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  channel text not null check (channel in ('telegram', 'web', 'voice', 'desktop', 'api')),
  external_conversation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_id_idx on public.conversations (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx on public.messages (conversation_id);

-- Locked down by default: no policies means the Data API (anon/publishable
-- key) has zero access. ENDRA Core talks to Postgres with the secret key,
-- which bypasses RLS entirely, so no policies are needed yet.
alter table public.users enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
