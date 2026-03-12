# PDR — Debug Domain and Shared Debug Modules (V1)

## 1. Purpose
Create a dedicated debug workspace domain for tool/run/event diagnostics while keeping production domains (especially Chat GUI) clean.

## 2. Locked Decisions
- Keep `Run Trace` on Chat GUI for now (no immediate removal).
- Add a new frontend domain: `frontend/src/domains/debug/`.
- Add shared frontend debug module: `frontend/src/shared/modules/debug/` for reusable logic/components.
- Add backend debug namespace in core: `backend/crates/agent_core/src/debug/` for reusable debug logic.
- Debug domain top rail includes active operator selector to emulate operator-scoped behavior.
- Debug domain is feature-gated (enable/disable cleanly without code deletion).

## 3. Why This Split
- Prevent debug UI growth inside production surfaces.
- Reuse one debug implementation across domains (Chat GUI + future Debug page).
- Keep domain wiring thin and move parsing/rendering logic to shared modules.
- Improve velocity for tool and flow validation without polluting user-facing UX.

## 4. Scope (V1)

### 4.1 Frontend
- New `Debug` route/domain surface with top rail + tabs.
- Tabs:
1. `Run Lab` (run lifecycle + event stream inspection).
2. `Tool Console` (manual tool invoke + raw/parsed response).
3. `State Inspector` (read-only snapshots for quick diagnostics).
- Shared module owns:
- event parsing/formatting
- filter/search controls
- reusable debug cards/panels
- copy/export helpers

### 4.2 Backend
- New `agent_core::debug` namespace for shared debug helpers:
- run trace formatting helpers
- tool replay/normalization helpers (for parity checks)
- structured debug payload shaping utilities
- Keep execution parity:
- Tool Console must execute via same runtime app tool path used by agents.
- Scope enforcement (e.g. comms sender scope) must remain identical.

## 5. Non-Goals (V1)
- Removing existing Chat GUI Run Trace.
- Full production-facing admin/debug permissions model.
- Full historical analytics warehouse.
- Replacing current runtime event model.

## 6. Feature Gating
- Frontend: hide `Debug` domain from nav when disabled.
- Backend: endpoints remain internal/dev-only in V1; gate exposure by runtime config.
- Default local/dev: enabled.
- Production target: disabled by default until explicit enable.

## 7. Folder Structure (Target)

### 7.1 Frontend
- `frontend/src/domains/debug/`
- `view.tsx`
- `surface/DebugSurface.tsx`
- `surface/top-rail/DebugTopRail.tsx`
- `surface/tabs/RunLabTab.tsx`
- `surface/tabs/ToolConsoleTab.tsx`
- `surface/tabs/StateInspectorTab.tsx`
- `model/useDebugDomainState.ts`
- `frontend/src/shared/modules/debug/`
- `lib/` (formatters/parsers/selectors)
- `model/` (shared state hooks)
- `surface/` (cards, lists, filters, payload viewers)

### 7.2 Backend
- `backend/crates/agent_core/src/debug/`
- `mod.rs`
- `run_trace.rs`
- `tool_console.rs` (shared contract helpers)
- `formatting.rs`

## 8. UX Requirements (V1)
- Premium but compact diagnostics UI.
- Fast filters (event type, error-only, phase, run id).
- Raw payload always available via expand/copy.
- Tool Console supports:
- tool picker
- args editor
- emulate operator context
- parsed + raw output view
- request history/replay inside session

## 9. Acceptance Criteria
- Debug domain route exists and is feature-gated.
- Active operator selector applies to debug actions.
- Tool Console executes tool calls through same backend execution path as agent calls.
- Chat GUI retains existing Run Trace behavior.
- Shared debug module is used by both Chat GUI Run Trace and Debug domain surfaces.
- No new debug-only parsing/formatting logic remains in `ChatGuiSurface.tsx`.

## 10. Implementation Checklist
- [ ] Add debug feature flag/config contract (frontend + runtime exposure rule).
- [ ] Scaffold `frontend/src/domains/debug` with top rail and tab container.
- [ ] Scaffold `frontend/src/shared/modules/debug` with reusable debug cards/filters/payload viewers.
- [ ] Move current run event card parsing/formatting from Chat GUI into shared module.
- [ ] Re-wire Chat GUI Run Trace to consume shared debug module.
- [ ] Add Tool Console tab UI and request/response rendering.
- [ ] Add backend debug namespace in `agent_core/src/debug`.
- [ ] Add shared helper functions for debug payload shaping and tool replay contracts.
- [ ] Wire Tool Console invoke path to existing app tool execution path (parity guarantee).
- [ ] Add operator emulation plumbing in Debug top rail and tab actions.
- [ ] Add State Inspector tab (read-only snapshots for org/comms/runtime run state).
- [ ] Add smoke tests: run trace render, tool console invocation, operator scope enforcement.
- [ ] Add minimal docs/readmes for new debug folders.

## 11. Rollout Plan
1. Extract shared debug module from current Chat GUI Run Trace.
2. Stand up Debug domain with Run Lab only.
3. Add Tool Console with strict parity path.
4. Add State Inspector.
5. Gate and stabilize for ongoing domain/tool development.

