-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge documents (source of truth per agent)
CREATE TABLE IF NOT EXISTS xenttech_knowledge_docs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid REFERENCES xenttech_agents(id) ON DELETE CASCADE,
  client_id       uuid,
  title           text NOT NULL,
  content         text NOT NULL DEFAULT '',
  source_type     text NOT NULL DEFAULT 'manual',
  source_url      text,
  supabase_table  text,
  supabase_filter jsonb,
  chunk_size      int  NOT NULL DEFAULT 500,
  status          text NOT NULL DEFAULT 'pending',
  last_synced_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Vectorised chunks (child of each doc)
CREATE TABLE IF NOT EXISTS xenttech_knowledge_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      uuid NOT NULL REFERENCES xenttech_knowledge_docs(id) ON DELETE CASCADE,
  agent_id    uuid NOT NULL REFERENCES xenttech_agents(id) ON DELETE CASCADE,
  chunk_index int  NOT NULL,
  content     text NOT NULL,
  embedding   vector(1536),
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Standard indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_agent_id   ON xenttech_knowledge_docs(agent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_status     ON xenttech_knowledge_docs(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_agent_id ON xenttech_knowledge_chunks(agent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc_id   ON xenttech_knowledge_chunks(doc_id);

-- HNSW vector similarity index (works on empty tables, better than ivfflat for dynamic datasets)
CREATE INDEX IF NOT EXISTS xenttech_knowledge_chunks_embedding_idx
  ON xenttech_knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);

-- Semantic search RPC called from the RAG engine
CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding  vector(1536),
  agent_id_filter  uuid,
  match_count      int   DEFAULT 5,
  match_threshold  float DEFAULT 0.7
)
RETURNS TABLE (
  id         uuid,
  content    text,
  metadata   jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    xenttech_knowledge_chunks.id,
    xenttech_knowledge_chunks.content,
    xenttech_knowledge_chunks.metadata,
    1 - (xenttech_knowledge_chunks.embedding <=> query_embedding) AS similarity
  FROM xenttech_knowledge_chunks
  WHERE xenttech_knowledge_chunks.agent_id = agent_id_filter
    AND xenttech_knowledge_chunks.embedding IS NOT NULL
    AND 1 - (xenttech_knowledge_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY xenttech_knowledge_chunks.embedding <=> query_embedding
  LIMIT match_count;
$$;
