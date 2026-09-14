-- Phase 3 tool architecture (CLAUDE.md sections 18-20, 25).

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations (id) on delete cascade,
  user_id uuid references public.users (id) on delete cascade,
  tool_name text not null,
  arguments jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz
);

create index if not exists approvals_status_idx on public.approvals (status);

alter table public.approvals enable row level security;

create table if not exists public.tool_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations (id) on delete set null,
  user_id uuid references public.users (id) on delete set null,
  tool_name text not null,
  arguments jsonb not null,
  status text not null check (status in ('success', 'error', 'pending_confirmation')),
  result jsonb,
  duration_ms integer,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists tool_runs_conversation_id_idx on public.tool_runs (conversation_id);

alter table public.tool_runs enable row level security;

-- Backs the "notes" test tool (TOOLARCH-007) - a write-risk tool, so it
-- exercises the confirmation flow end to end.
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists notes_user_id_idx on public.notes (user_id);

alter table public.notes enable row level security;
