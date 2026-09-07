# ADR-002 Supabase for Long-Term Memory

Status: Accepted

Context:
ENDRA's core value proposition is remembering things across conversations
and channels: user preferences, semantic facts, episodic events, ongoing
projects, decisions, and tasks. This requires durable, queryable storage
with support for both structured data and semantic (embedding-based)
search. Supabase is already available as part of the existing
infrastructure.

Decision:
Supabase (managed Postgres) is ENDRA's long-term memory and operational
data store. It holds users, conversations, messages, preferences,
memories + embeddings, projects, tasks, tool runs, agent runs, approvals,
and scheduled jobs (see `CLAUDE.md` section 22).

Reasons:

- Already available — no new infrastructure to provision or operate.
- Postgres + `pgvector` covers both relational operational data and
  semantic memory retrieval in one system, avoiding a second specialized
  vector database for the MVP.
- Row-level security and standard SQL tooling make it straightforward to
  reason about access and write migrations.

Alternatives:

- A dedicated vector database (Pinecone, Weaviate, etc.) alongside a
  separate relational store. Rejected for now: two systems to keep in
  sync is unnecessary complexity for the MVP; revisit only if `pgvector`
  proves insufficient at scale.
- Building a custom in-house storage layer. Rejected: explicitly out of
  scope per `CLAUDE.md` section 53 ("kendi vector database sistemimizi
  yazmak").

Consequences:

- Memory schema and migrations live in `supabase/migrations/`.
- Memory retrieval must rank by a combination of semantic similarity,
  importance, recency, and memory type — not raw similarity alone (see
  `CLAUDE.md` section 24).
- Not every conversation turn becomes a long-term memory; a promotion
  pipeline (extraction → importance → dedup/conflict check → storage)
  gates what gets persisted (section 23).
