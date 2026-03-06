# PDR — Account Sync and Persistent Storage (Web + Desktop)

## 1. Purpose
Define a storage and sync architecture where a single user account can access the same agents and conversation history from both web and desktop, with consistent data across devices.

## 2. Core Decisions
- Cloud backend is the canonical source of truth per user/workspace.
- Web and desktop are local-first synced clients (offline-capable cache + background sync).
- `localStorage` is not a primary datastore for agent payloads.
- Agent/runtime entities use stable IDs and revision metadata for deterministic sync.
- Conversation history is persisted server-side, not only client-side.

## 3. Data Consistency Goals
- Same account sees the same agents, threads, and messages on any device.
- Writes from one client appear on the other within sync interval targets.
- Deletes propagate reliably (tombstones/soft delete).
- Sync retries are idempotent and safe.

## 4. Storage Architecture

### 4.1 Server Canonical Store
- Persist all user data by workspace/account scope:
  - agents
  - threads
  - messages
  - agent assets metadata
  - settings
- Server assigns canonical revision/version for conflict control.

### 4.2 Web Client Store
- IndexedDB (via repository adapter) for local cache and offline reads/writes.
- Asset blobs stored as blobs/files in IndexedDB buckets, not base64 in large JSON rows.

### 4.3 Desktop Client Store
- Rust-backed persistent store (SQLite + file assets recommended).
- Tauri is a shell; storage logic lives behind runtime/repository boundaries.

## 5. Repository Boundary
- Define shared repository contracts used by UI/domain code only:
  - `AgentRepository`
  - `ThreadRepository`
  - `MessageRepository`
  - `AssetRepository`
  - `SettingsRepository`
- UI must never read/write persistence primitives directly.
- Web and desktop implementations satisfy the same repository interfaces.

## 6. Sync Protocol (V1)

### 6.1 Pull
- `pull(sinceCursor)` returns:
  - changed records
  - tombstones
  - next cursor

### 6.2 Push
- `push(batch)` accepts:
  - upserts with client revision metadata
  - deletes as tombstones
  - idempotency keys

### 6.3 Conflict Policy
- V1 default: last-write-wins using server authoritative timestamps/revisions.
- Preserve audit metadata for future manual conflict resolution UX.

## 7. Entity Requirements
- Every syncable record includes:
  - stable ID
  - `createdAt`
  - `updatedAt`
  - `revision` or server version
  - optional `deletedAt`
- Messages and threads must be linked by stable IDs and not inferred by position.

## 8. Conversation History Requirements
- Full thread/message history persisted server-side.
- Local clients cache recent and relevant history for fast UX.
- Sync includes:
  - new messages
  - edits (if supported)
  - deletes/tombstones
  - tool/run artifacts metadata (as model evolves)

## 9. Export / Import / Share Compatibility
- Runtime persistence and portable sharing are separate concerns.
- Continue supporting agent package export/import:
  - package includes manifest + assets + optional KB payload.
- Imported packages become normal synced records after ingestion.

## 10. Security and Multi-Tenant Scope
- All reads/writes authorized per authenticated account/workspace.
- Server APIs enforce tenant isolation.
- Sensitive tokens/secrets are not stored in portable agent packages.

## 11. Failure and Recovery
- If sync fails, clients continue to read/write local cache.
- Sync resumes with cursor/idempotent replay when connectivity returns.
- Corrupt local cache can be rebuilt from server canonical state.

## 12. Granular Implementation Checklist

### Phase 0 — Contracts
- [ ] Define shared sync entity schemas (agents, threads, messages, settings, tombstones).
- [ ] Define repository interfaces and dependency injection boundary for UI/runtime.
- [ ] Define sync cursor and idempotency key formats.

### Phase 1 — Local Stores
- [ ] Implement web repository adapters on IndexedDB.
- [ ] Implement desktop repository adapters on Rust storage layer.
- [ ] Remove direct `localStorage` dependency from primary agent persistence path.

### Phase 2 — Server Sync API
- [ ] Implement authenticated `pull(sinceCursor)` endpoint.
- [ ] Implement authenticated `push(batch)` endpoint with idempotency support.
- [ ] Add revision assignment and server-side conflict handling.

### Phase 3 — Sync Engine
- [ ] Build client sync worker (pull/push scheduling, backoff, retry).
- [ ] Add offline queue for pending writes.
- [ ] Apply incoming remote changes into local repositories deterministically.

### Phase 4 — Conversations
- [ ] Persist thread/message entities to repositories on creation/update.
- [ ] Sync conversation history end-to-end between clients.
- [ ] Add tombstone propagation for deleted threads/messages.

### Phase 5 — Migration
- [ ] One-time migration from legacy local storage to repository-backed storage.
- [ ] Verify avatar/asset migration integrity.
- [ ] Clear legacy keys after successful migration.

### Phase 6 — UX + Observability
- [ ] Add sync status indicator (`syncing`, `synced`, `offline`, `error`).
- [ ] Add conflict and retry telemetry.
- [ ] Add diagnostics for cursor lag and reconciliation failures.

## 13. Acceptance Criteria
- A user can create/edit/delete agents on desktop and see identical state on web after sync.
- Conversation threads and messages remain consistent across both clients.
- App remains usable offline and reconciles successfully when online.
- Data survives app restarts and device changes without `localStorage` quota failures.
- Export/import agent package flow remains functional and compatible with synced storage.
