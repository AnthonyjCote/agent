# PDR (Temp) — Org Tool Loop Continuity + Atomic Topology Writes (V1)

## Purpose
Capture findings from recent org tool testing, document fixes already shipped, and lock next revisions for:
1. all-or-nothing writes,
2. declarative topology payloads for complex one-call org creation,
3. preloaded compact org structure context to reduce read churn and loop drift.
4. simplify tool contract into a minimal ergonomic v2 surface.

## Findings (From Live Testing)
1. Tool execution worked end-to-end for creating org units/operators.
2. Agent loop was prone to repeated near-duplicate creation attempts when dependency resolution failed in mixed batches.
3. Partial success behavior caused write drift:
   - one op succeeded,
   - later op failed,
   - retry created more duplicate/empty entities.
4. Agent required too many full-snapshot `read` calls to discover references before writing.
5. Iteration continuity improved after adding ephemeral work-log context, but dependency-heavy batch workflows still need stronger tool contracts.

## Recent Fixes (Already Implemented)
1. Ack-stage prompt narrowed to router-only behavior with explicit handoff rules.
2. Deep-stage prompt hardened with stronger termination guidance.
3. Org tool integrated into runtime execution path (desktop + server) with real persistence writes.
4. UI now refreshes org chart from runtime after successful org tool mutations.
5. `create_operator` now requires non-empty:
   - `name`
   - `title`
   - `orgUnitId`
   - `primaryObjective`
   - `systemDirective`
6. Ephemeral per-run work log added to deep loop context:
   - streamed step notes
   - tool call/args summaries
   - tool result/error summaries
   - bounded window, cleared at run end.

## Decisions (Locked)
1. Batch org writes move to atomic all-or-nothing semantics by default.
2. No idempotency layer in this revision.
3. New complex create path will be declarative topology payload (single-call graph), not stepwise imperative dependencies.
4. Hard IDs are required only when attaching to existing entities by ID.
5. Existing-entity references may be resolved by deterministic name lookup (`name_ref`) under strict ambiguity rules.
6. Provide compact preloaded org structure context as a nested name-based hierarchy for deep stage when org tool is expanded.
7. Ack routing output includes an explicit `requires_web_search` boolean.
8. Deep prompt assembly deterministically includes web-search/citation instruction blocks only when `requires_web_search=true`; otherwise those blocks are excluded.
9. Agent-facing org tool I/O is name-ref first and compact relational structure first (no ID/link-object noise in model-facing context/output).
10. IDs and link objects remain internal runtime/storage implementation details only.
11. Tool refactor target is `org_manage_entities_v2` with only three action families:
   - `read`
   - `create`
   - `update`
12. `read` payload is array-based (single or batch), same as `create`/`update`.
13. `read` batches may mix target types in one request (`snapshot`, `business_unit`, `org_unit`, `operator`).
14. `create` and `update` payloads are always array-based (single or batch).
15. `update` uses strict patch semantics: only provided fields mutate.
16. Name ambiguity is a hard validation failure (no fuzzy matching).

## Scope
In scope:
1. Atomic batch transaction mode for org tool writes.
2. Declarative topology create API shape and resolver.
3. Deterministic reference coercion (`id` or `name_ref`) for existing entities.
4. Compact org tree preload context for tool-expanded deep requests.

Out of scope:
1. UI duplicate-name enforcement (noted for later UI rule).
2. Fuzzy name matching.
3. Full planner-style deterministic orchestration layer.

## Contract Revisions
### G) `org_manage_entities_v2` Simplified Contract (Locked)
Top-level action families:
1. `read`
2. `create`
3. `update`

Read targets (name-ref first):
1. `snapshot`
2. `business_unit`
3. `org_unit`
4. `operator`

Read behavior:
1. `read` input is always `items: []` (single read still uses array of one).
2. Mixed-target reads are supported in one request (for example operators + org units + business units together).
3. Each `read.items[]` entry carries its own `target` and resolver payload (`name_ref` by default).
4. `read.snapshot` returns full clean structure:
   - business units and org units by `name`
   - operators by `name` + `title`
   - no descriptions by default for snapshot
5. `read.business_unit` returns:
   - `name`
   - `shortDescription`
   - child business units + child org units with short descriptions
6. `read.org_unit` returns:
   - `name`
   - `shortDescription`
   - nested child org units and operators in relational tree form
7. `read.operator` returns:
   - `name`, `title`, `orgUnit`
   - `reportsTo`, `directReports`
   - `primaryObjective`
   - conditional fields by type (for example `roleBrief` / `systemDirective`)

Create behavior:
1. `create` input is always `items: []` (single create still uses array of one).
2. Runtime processes declarative objects:
   - receive
   - resolve refs
   - validate all
   - apply writes in required dependency order
   - atomic commit
3. Return clean success payloads with name-based summaries for model-facing output.

Update behavior:
1. `update` input is always `items: []`.
2. Each item identifies target by `name_ref` (or internal id for non-agent/internal use).
3. Patch semantics:
   - only provided fields change
   - omitted fields remain unchanged
4. Supports batch updates (example: move multiple operators to a new org unit in one call).

Execution pipeline (deterministic, locked):
1. Parse request
2. Resolve references (`name_ref -> internal id`)
3. Validate all items and all cross-item dependencies
4. Build required execution order (topological where needed)
5. Execute all changes in one DB transaction
6. Commit all or rollback all
7. Return structured result bundle

Name-resolution policy:
1. Exact normalized matching only.
2. If 0 matches => `not_found` validation error.
3. If >1 matches => `ambiguous_reference` validation error.
4. Any validation error => no writes (atomic rollback).

Model-facing output policy:
1. No internal IDs in normal model-facing output.
2. No internal link-object arrays in normal model-facing output.
3. IDs allowed only in explicit debug/internal logs.

### E) Ack Web Search Routing Flag
Ack JSON contract extension:
1. `requires_web_search: boolean` (default `false`)

Behavior:
1. Ack sets `requires_web_search=true` when user request requires current events, external facts, market/news updates, or other web-grounded evidence.
2. Deep prompt builder uses this flag to deterministically include or exclude:
   - web-search usage guidance
   - citation formatting requirements
   - source-link output rules
3. When `requires_web_search=false`, these web/citation blocks are omitted to reduce prompt bloat and instruction noise.

### A) Atomic Write Mode
Default write mode: `atomic`

Behavior:
1. Validate full request graph first.
2. If any validation or dependency resolution fails:
   - no entities written,
   - return structured validation errors.
3. If valid:
   - commit all writes in one transaction,
   - return created/updated entity summaries (name-based for model-facing output).

### B) Declarative Topology Payload
Add topology action (example name): `create_topology`

Payload concept:
1. `business_unit` (optional if attaching to existing)
2. `org_units` (supports nested hierarchy)
3. `operators` (can target declared org units)
4. `relations` (optional explicit manager/report relationships when needed)

Rules:
1. Agent sends desired final structure, not op-by-op dependency chain.
2. Tool generates canonical IDs during execution.
3. Tool returns mapping of declared nodes -> canonical IDs in internal/debug response paths.

### C) Existing Entity References
For attaching to existing entities:
1. Accept `id` or `name_ref`.
2. Resolution order:
   - use `id` if provided,
   - else resolve exact normalized `name_ref` in scoped parent domain.
3. Ambiguity policy:
   - 0 matches => validation error
   - >1 matches => ambiguity error
   - no write in either case (atomic rollback).
4. No fuzzy matching in V1.

### F) Agent-Facing Context and I/O Ergonomics
Agent-facing rules (explicit):
1. Model-facing org context is compact, relational, and name-based.
2. Do not expose internal numerical/canonical IDs in normal model-facing context or tool responses.
3. Do not expose internal link-object arrays in normal model-facing context or tool responses.
4. Relationship understanding for agents is conveyed by nested structure (tree) and scoped read outputs.

Tool input/output contract direction:
1. Tool accepts `name_ref` inputs for normal operation.
2. Optional `id` input remains supported for internal/debug/admin workflows but is not required for agent workflows.
3. Runtime performs hidden `name_ref -> internal id` resolution before persistence operations.
4. Runtime returns clean, compact name-based outputs to model.
5. Internal IDs may be emitted only in explicit debug/internal logs.

Scoped read patterns (locked, via `read.items[]`):
1. Scoped reads are expressed through `read` targets, not separate action names.
2. Example input pattern:
   - `target: "org_unit"` + `name_ref: "<org unit name>"`
3. Output includes compact operator summaries in that org-unit view:
   - `name`
   - `title`
   - `primaryObjective`

Compact relational preload format (model-facing):
1. Business unit tree by names
2. Org unit/sub-unit hierarchy by names
3. Optional scoped operator summaries by org unit:
   - `{name, title, primaryObjective}`

### D) Preloaded Org Structure Context
When org tool is expanded for deep stage, include compact structure summary:
1. Business units and org units are provided as a nested name-based hierarchy (no IDs).
2. Relationship context is conveyed by structure/indentation (parent-child nesting), not parent ID fields.
3. Operators are included in the hierarchy under their org units using compact labels (`name`, `title`).
4. Example shape (illustrative only):
   - `Level 1 BU`
     - `Level 2 OU`
     - `Level 2 OU`
       - `OPA — <title>`
       - `OPB — <title>`
       - `Level 3 OU`
         - `OPC — <title>`
         - `OPD — <title>`

Goals:
1. Reduce repetitive snapshot calls.
2. Improve first-pass write accuracy.
3. Keep context bounded and token-efficient.

## Implementation Checklist
### Phase 1 — Atomic Writes
- [ ] Add transactional atomic executor path for org write batches.
- [ ] Validate full batch before commit.
- [ ] Convert current partial-success semantics to full rollback on any failure.
- [ ] Return structured per-request validation error bundle.

### Phase 2 — Declarative Topology
- [ ] Add `create_topology` action schema in org tool manifest.
- [ ] Implement in-memory graph resolver for declared nodes/relations.
- [ ] Generate canonical IDs deterministically during apply.
- [ ] Return `created_entities` and `declared_ref -> canonical_id` map.

### Phase 3 — Existing Reference Coercion
- [ ] Add `name_ref` support for existing BU/org unit/operator references.
- [ ] Implement exact normalized resolver with scoped lookup.
- [ ] Add ambiguity and not-found structured errors.

### Phase 4 — Compact Preload Context
- [ ] Build compact org structure serializer for deep prompt context.
- [ ] Inject only when org tool is expanded/allowed for run.
- [ ] Add size guardrails (row cap / compact formatting).
- [ ] Remove model-facing link-object payloads from preload context.
- [ ] Ensure preload hierarchy is tree-structured and name-based.
- [ ] Ensure default model-facing preload excludes internal IDs.

### Phase 5 — Ack Web Search Flag
- [ ] Extend ack response schema with `requires_web_search`.
- [ ] Implement deterministic deep-prompt conditional assembly for web/citation blocks based on the flag.
- [ ] Add fallback default (`false`) when flag is absent.
- [ ] Add debug event visibility for resolved flag value per run.

### Phase 6 — Name-Ref I/O and Read Patterns
- [ ] Implement deterministic hidden name-ref resolution path (`name_ref -> internal id`).
- [ ] Support scoped org-unit operator retrieval via `read.items[]` target patterns (no standalone scoped-read action names).
- [ ] Add ambiguity/not-found validation responses without exposing internal IDs.
- [ ] Remove model-facing dependence on internal link arrays for relationship context.

### Phase 7 — v2 Tool Refactor
- [ ] Add new tool contract: `org_manage_entities_v2`.
- [ ] Implement `read/create/update` action router and deprecate v1-style action sprawl.
- [ ] Implement array-first request handling for `read`, `create`, and `update`.
- [ ] Implement mixed-target `read.items[]` execution in one request.
- [ ] Implement strict patch semantics for `update`.
- [ ] Implement target-specific `read` responses (`snapshot`, `business_unit`, `org_unit`, `operator`).
- [ ] Ensure model-facing responses remain name-based and compact.

## Test Criteria
1. Single-call complex topology creation succeeds (BU + nested org units + multiple operators).
2. Any invalid relation in topology yields zero writes.
3. Retry after failure does not create duplicate/partial entities.
4. Agent completes without mandatory full-snapshot `read` call when preload context is sufficient.
5. Final response includes created entity names and placement confirmation from tool result.

## Follow-ups (Not In This Pass)
1. UI-level rule to prevent duplicate business unit/org unit names in same scope.
2. Optional `partial_ok` mode (future only, explicit opt-in).
