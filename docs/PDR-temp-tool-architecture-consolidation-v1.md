# PDR (Temp): Tool Architecture Consolidation v1

## Status
- Proposed (execution-ready)
- Date: 2026-03-10
- Owner: Runtime/Tools

## Problem
Tool behavior is currently spread across multiple crates in a way that is functional but hard to navigate:
- Model-facing manifests live in `agent_core/src/tools/...`.
- Runtime dispatch glue lives in `agent_server` and `agent_desktop` runtime services.
- Most business/tool action logic for app tools lives in `agent_persistence`.

Result:
- Discoverability is poor.
- Tool changes require touching too many unrelated files.
- Runtime services contain logic that should be thin wiring only.

## Decision
Adopt a clear boundary:

1. `agent_core/src/tools/<tool>/` owns model-facing tool contract + tool execution handler orchestration.
2. `agent_persistence` owns persistence/domain services only (DB/files/queries/mutations), not tool contract or prompt-shaping behavior.
3. `agent_server` and `agent_desktop` runtime services are thin adapters that delegate to shared tool execution wiring.

This keeps tool code co-located without turning `agent_core` into a storage monolith.

## Target Structure

For each app tool (example: `org_manage_entities_v2`, `comms_tool`):

`agent_core/src/tools/<tool>/`
- `manifest.rs` (tool metadata + instructions)
- `input.rs` (strict parse/validation + normalized request shape)
- `handler.rs` (action routing/orchestration)
- `output.rs` (normalized envelope shaping)
- `mod.rs`

Optional for complex tools:
- `actions/` for per-action modules
- `prefetch.rs` (fast-ack prefetch resolvers)

`agent_persistence`
- Domain repositories/services only:
  - read/write functions
  - transactional boundaries
  - name-ref resolution helpers
  - schema models

`agent_server` / `agent_desktop`
- Tool adapter map only
- No business-rule branching
- No per-tool data shaping logic

## Non-Goals
- No database migration in this PDR.
- No tool contract redesign in this PDR.
- No behavior change to agent-visible functionality except where needed to preserve parity.

## Migration Plan

### Phase 1: Wiring Foundation
- Create shared app-tool dispatcher in `agent_core` (or a shared runtime adapter module) callable by both server and desktop.
- Replace duplicated `match tool_name` blocks in runtime services with delegation.

### Phase 2: Org Tool Extraction
- Move `org_manage_entities_v2` tool-layer logic (parse/normalize/response shaping) into `agent_core/src/tools/org_manage_entities_v2/`.
- Keep persistence operations in `agent_persistence` as callable domain methods.
- Preserve external tool contract exactly.

### Phase 3: Comms Tool Extraction
- Repeat for `comms_tool`.
- Keep transport adapters and persistence calls in domain/persistence layers.

### Phase 4: Cleanup + Guardrails
- Remove dead glue code from runtime services.
- Add module READMEs where needed.
- Add tests for:
  - input parse failures
  - action routing
  - output envelope shape parity

## Acceptance Criteria
- Tool entrypoint for each app tool is discoverable under `agent_core/src/tools/<tool>/`.
- `agent_server` and `agent_desktop` contain no per-tool business logic beyond adapter delegation.
- `agent_persistence` does not include model-facing prompt/tool instruction text.
- Existing tool behavior remains functionally equivalent for `org_manage_entities_v2` and `comms_tool`.
- Build passes for desktop + server targets.

## Risks
- Accidental behavior drift while moving parsing/validation.
- Temporary duplication during migration window.

## Mitigations
- Move one tool at a time with parity checks.
- Keep response envelope snapshots for before/after comparison.
- Stage changes behind thin adapter wrappers first, then remove old paths.

## Implementation Checklist
- [ ] Add shared app-tool dispatch adapter used by both runtimes.
- [ ] Refactor server runtime service to use shared adapter.
- [ ] Refactor desktop runtime service to use shared adapter.
- [ ] Extract `org_manage_entities_v2` tool-layer modules into `agent_core/src/tools/org_manage_entities_v2/`.
- [ ] Extract `comms_tool` tool-layer modules into `agent_core/src/tools/comms_tool/`.
- [ ] Remove duplicated/legacy per-runtime tool glue.
- [ ] Add/refresh READMEs for touched tool folders.
- [ ] Validate parity with existing tool tests/manual checks.
- [ ] Build-check server + desktop targets.

## Rollback
If regressions occur, restore previous runtime-service dispatch path and re-enable existing `agent_persistence` tool entrypoints while keeping new modules disabled.
