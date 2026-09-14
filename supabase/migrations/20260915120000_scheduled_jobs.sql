-- PROACTIVE-001/TOOLS-006: one-shot reminders. Recurrence and
-- condition-based monitors (PROACTIVE-002/003) are not built yet -
-- this only covers "remind me about X at time Y".

create table if not exists public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  content text not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'cancelled', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists scheduled_jobs_due_idx on public.scheduled_jobs (due_at)
  where status = 'pending';

alter table public.scheduled_jobs enable row level security;
