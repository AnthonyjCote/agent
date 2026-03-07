# PDR — Source-Context RAG From Citation URLs (V1)

## 1. Purpose
Define a V1 system that preserves and reuses web evidence by ingesting citation URLs from agent runs, so follow-up turns can retrieve relevant source context without re-searching by default.

## 2. Core Decision
- Keep model/provider behavior unchanged.
- Add app-owned evidence memory from cited URLs.
- Retrieval is thread-scoped first (local relevance), with optional workspace expansion later.

## 3. V1 Outcomes
- Citation URLs are persisted as first-class artifacts.
- URL content can be fetched, cleaned, chunked, embedded, and indexed.
- Follow-up questions retrieve top relevant chunks from indexed citations.
- Runtime injects only small relevant excerpts, not full pages.
- Re-search becomes fallback behavior, not default behavior.

## 4. Architecture Boundaries

### 4.1 Runtime Core (provider-agnostic)
- Owns retrieval orchestration and context injection.
- Decides when to query source index vs request fresh search.
- Never depends on provider-specific payload format.

### 4.2 Source Ingestion Module (app-owned)
- Inputs: citation records (`title`, `home_url`, `grounding_url`, `run_id`, `thread_id`).
- Fetches page content from URL.
- Cleans content (boilerplate strip, nav/footer removal where possible).
- Chunks content and stores metadata.

### 4.3 Retrieval Module (app-owned)
- Embeds user query and indexed chunks.
- Returns top-k chunks by similarity + recency filters.
- Supports citation-aware filters (`thread_id`, `agent_id`, `domain`, `date`).

### 4.4 Storage
- Persist citation metadata.
- Persist raw/cleaned text snapshots (bounded).
- Persist chunk index + embeddings.
- Persist fetch status and failure reasons.

## 5. Data Contract (V1)

### 5.1 Citation Record
- `citation_id`
- `workspace_id`
- `thread_id`
- `run_id`
- `agent_id`
- `title`
- `home_url`
- `grounding_url`
- `captured_at`

### 5.2 Source Document
- `source_doc_id`
- `citation_id`
- `final_url`
- `fetch_status` (`pending|ok|failed|blocked`)
- `http_status`
- `content_type`
- `raw_text_ref`
- `clean_text_ref`
- `fetched_at`

### 5.3 Source Chunk
- `chunk_id`
- `source_doc_id`
- `workspace_id`
- `thread_id`
- `chunk_index`
- `text`
- `token_count`
- `embedding_vector`
- `created_at`

## 6. Runtime Flow (V1)
1. Run completes with citations.
2. Runtime enqueues ingestion jobs for each citation URL.
3. Ingestion fetches + cleans + chunks + embeds + indexes.
4. On follow-up user turn, runtime calls retrieval first.
5. Runtime injects top-k chunk excerpts into model context under a compact "Source Context" section.
6. If retrieval confidence is low or index empty, runtime allows fresh web search.

## 7. Prompt/Context Rules
- Inject only relevant chunk excerpts with source IDs.
- Max injected source tokens per turn (strict budget).
- Never inject duplicate chunks already used recently unless explicitly needed.
- Instruct model to cite retrieved source IDs when using injected evidence.

## 8. Freshness and Re-fetch Policy (V1)
- Default TTL per source document (example: 24h).
- Re-fetch when:
  - source is missing,
  - source is stale beyond TTL,
  - user explicitly asks for latest/real-time update.
- Keep previous snapshot for traceability (bounded retention).

## 9. Safety and Cost Controls
- Domain allow/block hooks for fetcher.
- Size/time limits on fetch and extraction.
- Chunk count and embedding budget caps per run.
- Retrieval top-k cap and context token cap.

## 10. UX/Debug Requirements
- In debug panel, show source-index events:
  - `source_ingest_started`
  - `source_ingest_completed`
  - `source_ingest_failed`
  - `source_retrieval_used`
- Show when answer used cached source context vs fresh search.

## 11. Granular Implementation Checklist

### Phase 1 — Contracts and Storage
- [ ] Add citation persistence schema (if not already normalized).
- [ ] Add source document + source chunk tables.
- [ ] Add ingestion/retrieval event types to runtime trace model.

### Phase 2 — Ingestion Pipeline
- [ ] Build URL fetch service with timeout/size limits.
- [ ] Build cleaner/extractor service.
- [ ] Build chunker with deterministic chunk IDs.
- [ ] Add embedding generation service interface.
- [ ] Persist chunk vectors and metadata.

### Phase 3 — Retrieval Pipeline
- [ ] Build retrieval query API (thread-scoped V1).
- [ ] Implement top-k similarity retrieval.
- [ ] Add token-budgeted context packer for "Source Context".
- [ ] Add low-confidence fallback to fresh web search.

### Phase 4 — Runtime Integration
- [ ] Trigger ingestion jobs when citations are captured.
- [ ] Call retrieval before issuing new web searches.
- [ ] Inject retrieved chunks into prompt with compact format.
- [ ] Track whether response used cached evidence or fresh search.

### Phase 5 — Observability and Hardening
- [ ] Add ingestion/retrieval metrics (latency, success rate, hit rate).
- [ ] Add failure taxonomy (blocked page, parse failure, timeout, empty body).
- [ ] Add dedupe logic for repeated citation URLs.
- [ ] Add tests for stale refresh and follow-up continuity.

## 12. Non-Goals (V1)
- No global enterprise knowledge graph.
- No cross-workspace retrieval by default.
- No full-page HTML rendering dependency for retrieval quality.

## 13. Sequencing Decision
- This PDR is queued immediately after fast-ack routing implementation.
- No dependency from fast-ack to source-context RAG beyond existing citation capture.
