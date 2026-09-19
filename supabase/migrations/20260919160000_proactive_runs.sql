-- OBSERVABILITY: a lightweight audit trail for the proactive/scheduled
-- checks (memory hygiene, morning digest, ambient watch), mirroring
-- agent_runs' shape. Only meaningful events are logged here (a
-- delivered notification, or a per-user failure) - not every silent
-- no-op tick, which would just be noise at a 30s scheduler interval.
create table if not exists public.proactive_runs (
  id uuid primary key default gen_random_uuid(),
  check_name text not null,
  user_id uuid references public.users (id) on delete set null,
  status text not null check (status in ('success', 'error')),
  detail text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists proactive_runs_check_name_idx
  on public.proactive_runs (check_name, created_at desc);

alter table public.proactive_runs enable row level security;
