-- MEMORY-009: structured entity tracking - a step from flat memory
-- rows toward a personal knowledge system. Entities (people, places,
-- projects, organizations) are extracted from memory candidates in the
-- promotion pipeline; memory_entities links a memory to the entities
-- it mentions. No separate relationship type is modeled - entities
-- co-occurring in the same memory already give an implicit connection,
-- which is enough to answer "what have we discussed about İzmir"
-- without the extra failure surface of typed relationship extraction.
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  normalized_name text not null,
  type text not null check (type in ('person', 'place', 'project', 'organization', 'other')),
  created_at timestamptz not null default now(),
  unique (user_id, normalized_name)
);

create table if not exists public.memory_entities (
  memory_id uuid not null references public.memories (id) on delete cascade,
  entity_id uuid not null references public.entities (id) on delete cascade,
  primary key (memory_id, entity_id)
);

create index if not exists memory_entities_entity_id_idx on public.memory_entities (entity_id);

alter table public.entities enable row level security;
alter table public.memory_entities enable row level security;
