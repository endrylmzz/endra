-- Activates the "decision" memory type (CLAUDE.md section 7) as a
-- proper structured record instead of a passive, unstructured
-- semantic-memory blob. A dedicated table, matching the existing
-- pattern (scheduled_jobs, price_alerts, weather_alerts) rather than
-- overloading the generic `memories` table.
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  decision text not null,
  reasoning text,
  -- The scheduled_jobs row (if any) that will proactively ask "how did
  -- this go" - reuses the existing reminder/scheduler infrastructure
  -- rather than building a second delivery mechanism.
  follow_up_reminder_id uuid references public.scheduled_jobs (id) on delete set null,
  outcome text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists decisions_open_idx on public.decisions (user_id)
  where status = 'open';

alter table public.decisions enable row level security;
