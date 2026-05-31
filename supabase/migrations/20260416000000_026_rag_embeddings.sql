-- RAG infrastructure: pgvector extension + chunks table for knowledge documents.
-- Supports 1536-dim embeddings (OpenAI text-embedding-3-small / Voyage voyage-3-lite).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id text NOT NULL DEFAULT 'default' REFERENCES public.workspaces(id),
  document_id integer NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer,
  embedding vector(1536),
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_chunks_doc_idx
  ON public.knowledge_chunks (document_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_ws_idx
  ON public.knowledge_chunks (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_chunks_doc_chunk_unique
  ON public.knowledge_chunks (document_id, chunk_index);

-- ANN index using HNSW (faster queries than IVFFlat at the cost of slightly
-- larger index size; supports concurrent inserts without REINDEX).
-- Cosine distance matches the normalization used by OpenAI embeddings.
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw
  ON public.knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RLS — mirror the knowledge_documents policy so chunks inherit workspace scoping.
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_chunks_workspace_isolation ON public.knowledge_chunks;
CREATE POLICY knowledge_chunks_workspace_isolation ON public.knowledge_chunks
  USING (workspace_id = current_setting('app.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
