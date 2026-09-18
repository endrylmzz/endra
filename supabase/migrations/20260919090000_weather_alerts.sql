-- PROACTIVE-003 (completing it): weather-based conditional monitors,
-- alongside the already-shipped price_alerts. Two kinds only -
-- temperature threshold and "it started raining/snowing" - not a
-- generic condition-expression engine (CLAUDE.md: no speculative
-- abstraction).
create table if not exists public.weather_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  city text not null,
  kind text not null check (kind in ('temperature', 'precipitation')),
  direction text check (direction in ('above', 'below')),
  target_temperature_c numeric,
  status text not null default 'pending' check (status in ('pending', 'triggered', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint weather_alerts_temperature_fields check (
    kind <> 'temperature' or (direction is not null and target_temperature_c is not null)
  )
);

create index if not exists weather_alerts_status_idx on public.weather_alerts (status)
  where status = 'pending';

alter table public.weather_alerts enable row level security;
