-- MEMORY-008: for proactive memory connections - after a new memory is
-- saved, find older memories that are similar enough to be genuinely
-- related but not near-duplicates (those are already filtered out by
-- find_similar_memory before saving). Separate function, same reasoning
-- as find_similar_memory: a clean similarity to threshold on, not the
-- fused ranking search_memories returns.
create or replace function find_related_memories(
  p_user_id uuid,
  p_embedding vector (1536),
  p_exclude_id uuid,
  p_min_threshold real default 0.55,
  p_max_threshold real default 0.92,
  p_limit int default 3
) returns table (id uuid, content text, type text, similarity real) language sql stable as $$
  select id, content, type, 1 - (embedding <=> p_embedding) as similarity
  from public.memories
  where user_id = p_user_id
    and id != p_exclude_id
    and 1 - (embedding <=> p_embedding) >= p_min_threshold
    and 1 - (embedding <=> p_embedding) < p_max_threshold
  order by similarity desc
  limit p_limit;
$$;
