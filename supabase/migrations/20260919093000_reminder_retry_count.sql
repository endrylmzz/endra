-- Bounded delivery retry for reminders (ADR-007 explicitly left this
-- out of the first version). A failed delivery gets a few more
-- 30s-spaced attempts (the scheduler's own tick interval already
-- serves as the retry backoff) before being marked permanently failed.
alter table public.scheduled_jobs
  add column if not exists retry_count integer not null default 0;
