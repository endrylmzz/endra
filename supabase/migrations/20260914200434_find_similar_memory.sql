-- MEMORY-007: pure cosine-similarity lookup for duplicate detection in
-- the promotion pipeline. Separate from search_memories, whose "score"
-- is a fused ranking value, not a clean similarity we can threshold on.
create or replace function find_similar_memory(
  p_user_id uuid,
  p_embedding vector (1536),
  p_threshold real default 0.92
) returns table (id uuid, similarity real) language sql stable as $$
  select id, 1 - (embedding <=> p_embedding) as similarity
  from public.memories
  where user_id = p_user_id
    and 1 - (embedding <=> p_embedding) >= p_threshold
  order by similarity desc
  limit 1;
$$;
