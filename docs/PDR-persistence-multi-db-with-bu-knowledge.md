# PDR: Multi-DB Persistence with Business-Unit Knowledge Stores (V1)

## Purpose
Define a persistence architecture for Agent Deck that:
- supports both desktop and server targets from the same Rust internals,
- keeps operational/core state stable and fast,
- isolates high-churn runtime logs/history,
- stores knowledge in business-unit-specific databases for clean divestiture/export.

## Decision Summary
1. SQLite is the primary persistence engine in V1.
2. Persistence is split across multiple SQLite files by data domain.
3. Knowledge data is split by business unit (one knowledge DB per BU).
4. Org chart, manifests, and config remain centralized in core DB.
5. Conversation/runtime history is isolated in runtime DB.
6. Persistence access is DB-agnostic at the repository boundary (engine adapters behind stable interfaces).
7. Frontend persistence ownership moves to backend bridge APIs; frontend localStorage becomes migration source only.
8. Media storage moves from data URLs to file assets with relative paths during migration.
9. Cross-DB writes use explicit application orchestration with compensating behavior (no fake global transactions).
10. Startup runs migration + health checks before UI persistence operations are enabled.
11. Runtime query APIs are paginated/limited by default; no unbounded list endpoints.
12. `workspace_id` is generated once on first bootstrap and persisted in `workspace/workspace.json` (never hardcoded).
13. V1 SQLite adapter uses `rusqlite`; repository boundary stays engine-agnostic for future Postgres adapter.
14. Conversation history UX is modal-first (no persistent left rail in chat): thread browser uses a searchable/filterable card grid.
15. Conversation persistence and conversation-browser UI are built in tandem against the same runtime thread/message contracts.

## Scope
This PDR covers desktop and server storage internals only.
It does not define cloud sync or external managed databases yet.

## DB-Agnostic Requirement (Explicit)
All persistence must be implemented through stable repository interfaces owned by `agent_persistence`.

Rules:
1. Domain/runtime services must not depend on SQLite-specific APIs.
2. SQL engine details must be isolated behind adapter implementations.
3. Frontend and command contracts must not change when swapping storage engines.
4. Engine migration (SQLite -> Postgres for core/runtime) must require adapter/config changes, not domain logic rewrites.
5. BU knowledge portability semantics (`kb-<business_unit_id>.sqlite` export package) must remain stable regardless of primary core/runtime backend.

## Goals
- deterministic persistence behavior across targets,
- strong backup and restore ergonomics,
- low risk of DB bloat impacting core UX,
- clean BU-level data handoff for divestiture,
- minimal rewrite risk for future scaling.

## Non-Goals (V1)
- managed distributed SQL,
- multi-region replication,
- per-org-unit knowledge DB sharding,
- automatic vector DB migration.

## Storage Topology
Workspace root (per workspace):
- `data/core.sqlite`
- `data/runtime.sqlite`
- `data/knowledge/kb-core.sqlite`
- `data/knowledge/kb-<business_unit_id>.sqlite`
- `backups/`

Workspace metadata file:
- `workspace/workspace.json` (workspace id, schema versions, migration flags, created/updated timestamps)

Workspace ID policy (locked):
1. On first bootstrap, generate `workspace_id` if missing.
2. Persist it in `workspace/workspace.json`.
3. Reuse same `workspace_id` for all subsequent runs.
4. Do not hardcode `workspace_id` in frontend or backend runtime code paths.

### `core.sqlite`
Source of truth for structural and governance entities:
- business units,
- org units,
- operators,
- agent manifests,
- global and BU-level config,
- policy and permission metadata,
- external integration config metadata (non-secret references only).

### `runtime.sqlite`
High-churn operational data:
- threads,
- messages,
- run records,
- tool call records,
- runtime events,
- inbox/outbox state,
- status transitions.

### `kb-core.sqlite`
Shared/global knowledge not owned by a single BU:
- platform SOPs,
- enterprise-wide policy docs,
- shared reference indexes,
- shared KB metadata/chunks.

### `kb-<business_unit_id>.sqlite`
Business-unit-owned knowledge store:
- BU SOPs,
- BU docs/wiki/KB metadata,
- chunk metadata and retrieval indexes,
- BU-scoped source references.

This file is the primary unit for BU data portability/divestiture.

## Key IDs and Cross-DB Linking
Use canonical IDs in all DBs:
- `workspace_id`
- `business_unit_id`
- `org_unit_id`
- `operator_id`
- `agent_id`
- `thread_id`
- `run_id`
- `doc_id`

Cross-DB joins are resolved in application/repository layer, not SQL cross-file joins.

## Bridge Contract Decision (Locked)
Persistence APIs are backend-owned and shared across desktop/server targets with identical DTO shapes.

Transport bindings:
1. Desktop: Tauri commands.
2. Server: HTTP endpoints.

Required contract groups in V1:
1. Agent Manifest
  - `list_agent_manifests(workspace_id)`
  - `create_agent_manifest(workspace_id, payload)`
  - `update_agent_manifest(workspace_id, agent_id, payload)`
  - `delete_agent_manifest(workspace_id, agent_id)`
2. Org Chart
  - `get_org_chart_state(workspace_id)`
  - `execute_org_chart_command(workspace_id, command)`
  - `undo_org_chart_command(workspace_id)`
  - `redo_org_chart_command(workspace_id)`
3. Runtime
  - `append_run_events(workspace_id, run_id, events)` (backend runtime internal path first)
  - `list_run_events(workspace_id, run_id, page)`
  - `list_thread_messages(workspace_id, thread_id, page)`
4. Workspace / Persistence Health
  - `bootstrap_workspace(workspace_id)`
  - `get_persistence_health(workspace_id)`
5. Conversations / Threads
  - `list_threads(workspace_id, operator_id, filters, page)`
  - `get_thread_messages(workspace_id, thread_id, page)`
  - `create_thread(workspace_id, operator_id, title?)`
  - `update_thread(workspace_id, thread_id, patch)` (rename/archive/unarchive)
  - `delete_thread(workspace_id, thread_id)`
  - `append_thread_message(workspace_id, thread_id, message)`

Rule: frontend must not write localStorage for manifests/org chart after cutover.

## Conversation Browser UX + Persistence Addendum (V1)
Conversation browsing is implemented as a large modal grid in Chat GUI (not a permanent left sidebar).

UI requirements:
1. Top rail filter controls:
  - business unit filter,
  - org unit filter (dependent on business unit),
  - operator filter,
  - status filter (`active`, `archived`),
  - sort selector (`recent`, `oldest`, `most messages`),
  - typed search bar (title + summary + preview text match).
2. Grid cards show:
  - thread title,
  - summary snippet,
  - last updated timestamp,
  - message count,
  - owning operator identity.
3. Card actions:
  - open thread,
  - rename,
  - archive/unarchive,
  - delete.
4. Selected thread loads full message history and resumes chat in place.

Persistence requirements:
1. `runtime.sqlite` stores canonical thread metadata and message rows.
2. Thread list queries support server-side filtering, search, sorting, and pagination.
3. Message query APIs are paginated and ordered deterministically.
4. Thread updates must be idempotent and race-safe.

## Agent Runtime Workspace Isolation
Each operator has a dedicated runtime folder:
- `operators/<operator_id>/runtime/`
- `operators/<operator_id>/artifacts/`
- `operators/<operator_id>/logs/`

CLI agents launch from operator runtime folder only.
DB files are outside runtime folders and never exposed as tool working directories.

Hard guardrails:
1. Tool execution path allowlist is restricted to operator runtime/artifacts/logs only.
2. Any path resolving into `data/` or `backups/` is rejected.
3. Symlink traversal into DB folders is rejected.

## Media Storage Rule (Explicit)
Profile images, logos, and other UI media are file-based assets under workspace storage, not SQLite BLOB payloads.

Canonical rule:
1. SQLite stores media metadata + relative path only.
2. Paths must be relative to workspace root (never absolute machine-specific paths).
3. Backup/export must include both DB files and media folder tree.
4. Import/restore must remap relative paths against the new workspace root automatically.

Suggested media layout:
- `media/operators/<operator_id>/avatar.<ext>`
- `media/business-units/<business_unit_id>/logo.<ext>`

Suggested metadata fields:
- `*_path` (relative path)
- `mime_type`
- `width`
- `height`
- `size_bytes`
- `sha256`

Locked V1 implementation:
1. Use `media/` file storage only; no image/blob storage in SQLite.
2. `avatarDataUrl`/`logoDataUrl` fields are temporary migration inputs and not persisted post-migration.
3. Core DB stores canonical relative media paths and metadata.

## Knowledge Routing Rules
1. Each knowledge write is tagged with `business_unit_id` (nullable).
2. If `business_unit_id` is set, write to `kb-<business_unit_id>.sqlite`.
3. If no BU ownership, write to `kb-core.sqlite`.
4. Retrieval resolves candidate DBs by context scope first, then executes ranked search.

## Divestiture / BU Export Rules
For a BU handoff:
1. Export BU record and dependencies from `core.sqlite`.
2. Export BU-relevant runtime subset from `runtime.sqlite`.
3. Export `kb-<business_unit_id>.sqlite` file directly.
4. Package outputs with manifest and checksums.

## Backup Strategy (V1)
- scheduled backups per DB file,
- timestamped snapshots under `backups/`,
- optional JSON export bundles for human/audit portability,
- backup/export package always includes media folder content referenced by relative paths,
- restore supports full workspace or per-DB restoration.

Operational defaults:
1. Keep last 14 daily snapshots and last 8 hourly snapshots per DB.
2. Snapshot operation is copy-on-stable-point (SQLite backup API), never raw file copy while writes are active.

## Security and Secrets
- secrets are not stored as plaintext in these DBs,
- DB stores secret references/keys IDs only,
- actual secrets resolved through platform secret storage mechanism.

## Why This Architecture
- prevents core DB slowdown from runtime/KB growth,
- keeps BU knowledge cleanly separable,
- reduces future rewrite risk,
- supports desktop and server with same persistence crate contracts,
- preserves engine flexibility via DB-agnostic repositories.

## Tradeoffs
- app-layer cross-DB orchestration is required,
- more files to manage than single-DB design,
- transaction boundaries are per DB (not global).

Accepted due to clear operational and portability benefits.

## Migration Decision: LocalStorage -> SQLite (Locked)
One-time migration runs during workspace bootstrap.

Sources:
1. `agent-deck.agent-manifests`
2. `agent-deck.org-chart.v1`
3. `agent-deck.org-chart.v1.compact`

Rules:
1. Migration is idempotent; safe to re-run.
2. Migration writes a completion marker in `workspace/workspace.json`.
3. On successful migration, frontend localStorage keys are no longer used as source of truth.
4. Legacy image data URLs are converted to media files; DB rows store relative media paths.
5. If migration fails, persistence health is `degraded` and UI is blocked from mutating persistent state.

## Transaction Boundary Decision (Locked)
1. Per-DB transaction atomicity only.
2. Cross-DB workflows use orchestrator pattern:
  - step sequence,
  - durable operation log entry,
  - compensating actions on downstream failure.
3. V1 critical compensations:
  - create agent manifest + create operator link,
  - delete agent manifest + delete linked operator (if source link exists),
  - media write + metadata update.

## Startup and Health Decision (Locked)
Startup order:
1. Resolve workspace paths.
2. Ensure folders exist.
3. Run migrations per DB.
4. Run integrity checks.
5. Expose readiness flag.

Integrity checks:
1. All required DB files exist and are openable.
2. Migration versions match expected app schema versions.
3. Media root exists and is writable.
4. Knowledge DB resolver can open `kb-core.sqlite`.

Health states:
1. `healthy`: all checks pass.
2. `degraded`: read-only allowed, writes blocked for failing domains.
3. `failed`: persistence unavailable; runtime start blocked.

## Runtime Query Limits Decision (Locked)
Default API limits:
1. `list_run_events`: max 200 events per page.
2. `list_thread_messages`: max 100 messages per page.
3. `list_runs_for_thread` (if added): max 50 runs per page.
4. Requests without explicit pagination use defaults; no unbounded fetch behavior.

## Implementation Checklist
### Phase 0: Contracts and Cutover Plan
- [x] Freeze DTO contracts for manifest/org-chart/runtime/workspace health APIs (desktop + server parity).
- [x] Define transport mapping table (Tauri command name <-> HTTP path).
- [x] Define frontend cutover flag and remove-write path for localStorage once backend persistence is enabled.
- [x] Add migration marker schema to `workspace/workspace.json`.

### Phase 1: Persistence Foundation
- [x] Create Rust crate: `backend/crates/agent_persistence`.
- [ ] Define DB-agnostic repository interfaces for core/runtime/knowledge domains.
- [x] Define DB registry/resolver for workspace paths.
- [x] Implement SQLite adapter (rusqlite) for repository interfaces (`core`, `runtime`, `kb-core`, `kb-<business_unit_id>`).
- [x] Add migration runner per DB type.
- [x] Add workspace bootstrap routine to create required DB files/folders + workspace metadata file.
- [x] Add startup persistence health checks and readiness gate.

### Phase 2: Core Schema + Repositories
- [x] Add core schema migrations for org, operator, agent manifest, config entities.
- [ ] Implement repository interfaces for core entities.
- [x] Implement desktop/server bridge APIs for core entities with identical DTOs.
- [x] Replace frontend local-storage adapters with backend calls (desktop target first, then server).

### Phase 3: Runtime Schema + Repositories
- [ ] Add runtime schema migrations for threads/messages/runs/events/tool calls.
- [ ] Implement runtime repositories with append/query APIs.
- [ ] Enforce pagination defaults and max limits in runtime query APIs.
- [ ] Wire chat runtime persistence paths to runtime repository.
- [ ] Add backpressure-safe append path for run events.

### Phase 3A: Conversation Browser (Modal Grid) + Persistence
- [ ] Add thread metadata schema in `runtime.sqlite` (`thread_id`, `operator_id`, title, summary, status, counts, timestamps).
- [ ] Add thread list APIs with filter rail support (BU/org/operator/status/sort/search).
- [ ] Add thread card DTO for modal grid.
- [ ] Add message pagination API + cursor contract for thread hydration.
- [ ] Build Chat GUI `Conversations` modal (grid cards + top filter rail + typed search bar).
- [ ] Wire open/rename/archive/delete thread actions in modal to runtime persistence APIs.
- [ ] Persist selected thread per active operator and restore on reopen.

### Phase 4: Knowledge Split by BU
- [ ] Add knowledge schema migrations (core + BU DBs).
- [ ] Implement knowledge repository router by `business_unit_id`.
- [ ] Add helper for lazy creation of `kb-<business_unit_id>.sqlite`.
- [ ] Wire KB writes and retrieval lookups through router.

### Phase 5: Export/Backup
- [ ] Implement DB snapshot utility per DB file using SQLite backup API.
- [ ] Add BU export command packaging core/runtime subset + BU knowledge DB.
- [ ] Add checksum manifest generation.
- [ ] Add restore paths for full workspace and per-BU package.
- [ ] Add media folder inclusion in backup/export/restore flows.

### Phase 6: Guardrails
- [ ] Enforce runtime working-directory restrictions for CLI launches.
- [ ] Add path guards blocking DB paths from tool workspace exposure.
- [ ] Add symlink traversal guards for runtime tool paths.
- [ ] Add structured logging around DB routing decisions.
- [ ] Add compensating action handlers for cross-DB workflows.

### Phase 7: Tests
- [ ] Unit tests for DB resolver/routing.
- [ ] Migration tests per DB type.
- [ ] Migration tests from localStorage payload fixtures (manifest + org chart + legacy image fields).
- [ ] Integration tests for BU knowledge write/read routing.
- [ ] Integration tests for BU export package integrity.
- [ ] Regression test: deleting/moving BU does not orphan routing metadata.
- [ ] Health-check regression tests for healthy/degraded/failed states.
- [ ] Runtime pagination limit tests (reject/clip oversize page requests).

## Open Follow-Ups
- Server deployment strategy for SQLite file locking and backups.
- Add Postgres adapter for `core/runtime` using same repository interfaces when scale/concurrency demands it.

## Status
In progress. Persistence foundation and core cutover are partially implemented; runtime thread/message persistence and conversation browser UI are the next active slice.
