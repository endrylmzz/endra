-- PROACTIVE-002: recurring reminders - a nullable interval, not a full
-- cron spec (CLAUDE.md: build for the next logical step). When set,
-- the scheduler reschedules the same row (due_at += interval, status
-- back to pending) instead of marking it sent.
alter table public.scheduled_jobs
  add column if not exists recurrence_seconds integer;

-- PROACTIVE-003: the concrete, key-free conditional monitor - a
-- one-shot crypto price alert (CoinGecko, already used by
-- get_crypto_price). Weather-based conditions wait on TOOLS-001.
create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  coin_id text not null,
  vs_currency text not null,
  direction text not null check (direction in ('above', 'below')),
  target_price numeric not null,
  status text not null default 'pending' check (status in ('pending', 'triggered', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists price_alerts_status_idx on public.price_alerts (status)
  where status = 'pending';

alter table public.price_alerts enable row level security;
