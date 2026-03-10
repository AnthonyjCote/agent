# PDR (Temp): Tool Architecture Consolidation v1

## Status
- Proposed (execution-ready)
- Date: 2026-03-10
- Owner: Runtime/Tools

## Problem
Tool behavior is currently split across crates with weak discoverability:
- Tool manifests live in `agent_core/src/tools/...`.
- Runtime dispatch glue lives in `agent_server` and `agent_desktop`.
- Tool orchestration + business behavior are mixed inside `agent_persistence` (`org_tool.rs`, `comms_tool.rs`, `comms_delivery.rs`).

Result:
- Tool changes require edits across unrelated modules.
- Runtime services are thicker than they should be.
- Persistence crate is carrying app-domain behavior.

## Decision
Adopt a strict 3-layer tool boundary:

1. `agent_core/src/tools/<tool>/`
- Owns model-facing tool contract and execution handler.
- Parses tool input, validates shape, calls domain service, shapes output envelope.

2. `crates/app_domains/<domain>/`
- Owns business/use-case logic.
- No model prompt text and no runtime transport wiring.

3. `agent_persistence`
- Owns persistence adapters only (DB/files/repository implementations).
- No tool contract or tool envelope shaping.

`agent_server` and `agent_desktop` runtime services stay thin: delegate tool execution to shared dispatch.

## Target Structure

For each app tool (example: `org_manage_entities_v2`, `comms_tool`):

`agent_core/src/tools/<tool>/`
- `manifest.rs`
- `input.rs`
- `handler.rs`
- `output.rs`
- `mod.rs`
- optional: `actions/`, `prefetch.rs`

`crates/app_domains/<domain>/`
- domain models
- services/use-cases
- repository traits (implemented by `agent_persistence`)

`agent_persistence`
- repository impls + SQL/file adapters
- transaction boundaries
- state mapping

## Specific Moves

Move out of `agent_persistence`:
- `org_tool.rs` tool-layer parsing/orchestration/output shaping -> `agent_core/tools/org_manage_entities_v2` + `app_domains/org`
- `comms_tool.rs` tool-layer parsing/orchestration/output shaping -> `agent_core/tools/comms_tool` + `app_domains/comms`
- `comms_delivery.rs` behavior/routing policy -> `app_domains/comms` (persistence calls remain via repository adapter)

Keep in `agent_persistence`:
- `state.rs`, `sqlite.rs`, `workspace.rs`, `error.rs`, `health.rs`

## Non-Goals
- No tool contract redesign in this pass.
- No provider adapter overhaul in this pass.
- No behavior changes beyond parity-preserving refactor.

## Migration Plan

### Phase 1: Shared Dispatch Foundation
- Add shared app-tool dispatcher callable by both server and desktop runtimes.
- Replace per-runtime `match tool_name` branching with delegation.

### Phase 2: Org Tool Consolidation
- Add `input.rs`, `handler.rs`, `output.rs` under `agent_core/tools/org_manage_entities_v2`.
- Move org business logic into `app_domains/org`.
- Leave storage adapters in `agent_persistence`.

### Phase 3: Comms Tool Consolidation
- Add `input.rs`, `handler.rs`, `output.rs` under `agent_core/tools/comms_tool`.
- Move comms business logic into `app_domains/comms`.
- Keep persistence adapters in `agent_persistence`.

### Phase 4: Cleanup
- Delete legacy tool orchestration from `agent_persistence`.
- Keep compatibility wrappers only if strictly needed, then remove.
- Update READMEs and code maps.

## Acceptance Criteria
- Tool entrypoint is discoverable under `agent_core/src/tools/<tool>/`.
- Runtime services have no per-tool business branching.
- `agent_persistence` no longer owns tool orchestration/business behavior.
- Tool behavior is parity-equivalent for org + comms.
- Server and desktop builds pass.

## Risks
- Behavior drift while moving parsing/normalization.
- Short-term duplication during migration.

## Mitigations
- Migrate one tool at a time with parity checks.
- Snapshot before/after tool envelopes for regression checks.
- Keep rollback path by preserving old implementation behind a temporary adapter until parity is confirmed.

## Implementation Checklist
- [ ] Add shared app-tool dispatch adapter.
- [ ] Refactor server runtime service to delegate app tools.
- [ ] Refactor desktop runtime service to delegate app tools.
- [ ] Extract org tool handler/input/output into `agent_core/tools/org_manage_entities_v2`.
- [ ] Move org business rules into `app_domains/org`.
- [ ] Extract comms tool handler/input/output into `agent_core/tools/comms_tool`.
- [ ] Move comms business rules into `app_domains/comms`.
- [ ] Shrink `agent_persistence` to storage adapters.
- [ ] Remove legacy glue and update READMEs.
- [ ] Validate parity + build server/desktop.

## Rollback
If regression appears, route dispatcher back to legacy path while retaining new modules, then fix parity gaps and re-enable.
