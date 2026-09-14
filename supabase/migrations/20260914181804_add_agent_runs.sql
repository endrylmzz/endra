-- CORE-009: agent run logging (CLAUDE.md section 25). Minimal fields
-- for now - no tools/memory-retrieval yet, so tools_requested/
-- retrieved_memory_ids etc. are added when Phase 3/MEMORY-006 exist.

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations (id) on delete set null,
  user_id uuid references public.users (id) on delete set null,
  provider text not null,
  model text not null,
  status text not null check (status in ('success', 'error')),
  duration_ms integer not null,
  input_tokens integer,
  output_tokens integer,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists agent_runs_conversation_id_idx on public.agent_runs (conversation_id);

alter table public.agent_runs enable row level security;
