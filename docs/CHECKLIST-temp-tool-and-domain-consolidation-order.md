# Checklist (Temp): Tool + Domain Consolidation Order of Operations

## Goal
Refactor org/comms tool stack into:
- `agent_core/tools/*` for tool handler logic
- `app_domains/*` for business logic
- `app_persistence` for storage adapters only

Keep production behavior stable while migrating.

## Phase 0: Safety Baseline
- [ ] Capture current behavior snapshots for `org_manage_entities_v2` and `comms_tool` (inputs + outputs).
- [ ] Record current runtime dispatch paths in server and desktop.
- [ ] Freeze tool manifest contracts for this refactor window.

## Phase 1: Shared Dispatch Wiring
- [x] Create shared app-tool dispatcher module in `agent_core` (single entrypoint for app tools).
- [x] Route `agent_server` runtime service to shared dispatcher.
- [x] Route `agent_desktop` runtime service to shared dispatcher.
- [ ] Verify no behavior change in manual smoke tests.

## Phase 2: Define Domain Ports
- [x] Add `ports.rs` in `app_domains/org` for org read/create/update operations.
- [x] Add `ports.rs` in `app_domains/comms` for accounts/threads/messages/delivery operations.
- [x] Add shared domain errors in `app_domains/core` where needed.
- [x] Ensure trait signatures cover current v2 tool capabilities.

## Phase 3: Persistence Adapter Extraction
- [x] Implement `app_domains/org` ports in `app_persistence`.
- [x] Implement `app_domains/comms` ports in `app_persistence`.
- [ ] Keep all SQL/file operations in persistence implementations.
- [ ] Remove direct tool-envelope shaping from persistence adapter code.

## Phase 4: Org Tool Consolidation
- [x] Add `agent_core/src/tools/org_manage_entities_v2/input.rs`.
- [x] Add `agent_core/src/tools/org_manage_entities_v2/output.rs`.
- [x] Add `agent_core/src/tools/org_manage_entities_v2/handler.rs`.
- [ ] Move org action orchestration into `app_domains/org/service`.
- [x] Update tool registry/dispatcher to call new org handler.
- [ ] Compare output parity against Phase 0 snapshots.

## Phase 5: Comms Tool Consolidation
- [x] Add `agent_core/src/tools/comms_tool/input.rs`.
- [x] Add `agent_core/src/tools/comms_tool/output.rs`.
- [x] Add `agent_core/src/tools/comms_tool/handler.rs`.
- [ ] Move comms action orchestration into `app_domains/comms/service`.
- [ ] Move comms delivery policy into `app_domains/comms` (adapter calls persistence port).
- [x] Update tool registry/dispatcher to call new comms handler.
- [ ] Compare output parity against Phase 0 snapshots.

## Phase 6: Legacy Path Removal
- [ ] Remove `execute_org_manage_entities_v*` tool orchestration methods from persistence (keep adapter methods only).
- [ ] Remove `execute_comms_tool` orchestration from persistence (keep adapter methods only).
- [ ] Delete obsolete helper code tied only to old tool path.
- [ ] Ensure runtime services contain no per-tool business branching.

## Phase 7: Documentation + Navigation
- [ ] Update `docs/PDR-temp-tool-architecture-consolidation-v1.md` status/progress.
- [ ] Update `docs/PDR-temp-app-domain-architecture-consolidation-v1.md` status/progress.
- [ ] Add/refresh READMEs in:
  - `agent_core/src/tools/org_manage_entities_v2/`
  - `agent_core/src/tools/comms_tool/`
  - `crates/app_domains/org/`
  - `crates/app_domains/comms/`

## Phase 8: Validation Gates
- [ ] Build check backend workspace targets used in desktop + server flows.
- [ ] Manual test: org tool create/update/read from chat GUI.
- [ ] Manual test: comms tool account/thread/message operations from chat GUI.
- [ ] Confirm no runtime-service duplicate dispatch logic remains.

## Phase 9: Cleanup Commits
- [ ] Commit wiring foundation.
- [ ] Commit org migration.
- [ ] Commit comms migration.
- [ ] Commit legacy removal + docs.

## Rollback Strategy
- [ ] Keep compatibility branch point after Phase 1.
- [ ] If parity fails in Phase 4/5, route dispatcher back to legacy handlers temporarily.
- [ ] Re-run parity checks, then re-enable new path.
