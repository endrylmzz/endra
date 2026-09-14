-- MEMORY-004: preferences, MEMORY-005/006: semantic memory + multi-signal
-- retrieval. See docs/decisions/ADR-002 and the 2026 memory-architecture
-- research notes in DEVLOG.md (multi-signal fusion beats vector-only
-- retrieval: semantic + keyword + importance + recency).

create extension if not exists vector;

create table if not exists public.preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

alter table public.preferences enable row level security;

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('semantic', 'episodic', 'project', 'decision', 'task')),
  content text not null,
  importance real not null default 0.5 check (importance between 0 and 1),
  confidence real not null default 1.0 check (confidence between 0 and 1),
  source text,
  embedding vector (1536),
  content_tsv tsvector generated always as (to_tsvector('simple', content)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  expires_at timestamptz
);

create index if not exists memories_user_id_idx on public.memories (user_id);

create index if not exists memories_embedding_idx on public.memories using ivfflat (
  embedding vector_cosine_ops
) with (lists = 100);

create index if not exists memories_content_tsv_idx on public.memories using gin (content_tsv);

alter table public.memories enable row level security;

-- Fused retrieval: semantic similarity + keyword rank + importance + a
-- recency decay (30-day half-life-ish exponential). Weights are a
-- reasonable starting point, not tuned against real usage yet.
create or replace function search_memories(
  p_user_id uuid,
  p_query_embedding vector (1536),
  p_query_text text,
  p_limit int default 10
) returns table (id uuid, content text, type text, importance real, score real) language sql stable as $$
  select
    m.id,
    m.content,
    m.type,
    m.importance,
    (
      0.45 * (1 - (m.embedding <=> p_query_embedding))
      + 0.25 * coalesce(ts_rank(m.content_tsv, plainto_tsquery('simple', p_query_text)), 0)
      + 0.15 * m.importance
      + 0.15 * exp(-extract(epoch from (now() - m.created_at)) / 2592000.0)
    ) as score
  from public.memories m
  where m.user_id = p_user_id
    and (m.expires_at is null or m.expires_at > now())
  order by score desc
  limit p_limit;
$$;
