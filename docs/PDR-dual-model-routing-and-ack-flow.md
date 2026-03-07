# PDR — Provider-Agnostic Dual-Model Routing (Fast Ack + Deep Work)

## 1. Purpose
Define a provider-agnostic runtime pattern that delivers:
- instant UX acknowledgment via a fast model,
- optional deeper execution via a higher-capability model,
- unified behavior across CLI/API/local providers,
- clear event contracts for streaming status, tool activity, and final output.

## 2. Core Decision
- Runtime orchestration owns the `ack` vs `deep` policy.
- Provider adapters own concrete model mapping for each stage.
- UI consumes one normalized event contract regardless of provider.

## 3. Architecture Boundaries

### 3.1 Runtime Core (provider-agnostic)
- Adds two-stage run plan:
  - `ack_stage` (fast model)
  - `deep_stage` (optional heavier model)
- Decides stage routing based on request complexity and policy.
- Emits canonical events:
  - `ack_started`, `ack_delta`, `ack_completed`
  - `deep_started`, `model_delta`, `tool_use`, `tool_result`, `run_completed`, `run_failed`
- Never references provider model IDs directly.

### 3.2 Provider Adapter Layer (provider-specific)
- Maps logical profile names to concrete models:
  - `profile_ack`
  - `profile_deep`
- Examples:
  - Gemini: `gemini-2.5-flash-lite` -> `gemini-3-flash-preview`
  - OpenAI/Codex: `gpt-5.1-mini` -> `gpt-5.4-max`
  - Local: `3b-instruct` -> `70b/80b-instruct`
- Handles provider-native stream parsing and tool semantics.

### 3.3 Config Layer
- Shared runtime config fields (provider-agnostic):
  - `routing.enabled`
  - `routing.ack_timeout_ms`
  - `routing.deep_auto_start`
  - `routing.deep_trigger_policy`
- Provider config fields:
  - `providers.<id>.profiles.ack`
  - `providers.<id>.profiles.deep`

## 4. UX Flow
1. User sends message.
2. Runtime starts `ack_stage` immediately.
3. UI shows instant ack text and status.
4. Runtime chooses one path:
- `quick_answer`: ack is final, run completes.
- `deep_work`: deep stage starts and streams progress/final output.
5. UI shows deep stream in same conversation turn (or linked follow-up turn per policy).

## 5. Routing Policy (V1)
- Deterministic lightweight classifier in runtime:
  - short/social prompt -> `quick_answer`
  - tool/data/research/multi-step prompt -> `deep_work`
- Optional provider-assisted classification later.
- Hard override controls:
  - user toggle `Quick` / `Deep`
  - agent profile default mode.

## 6. Streaming and Finalization Contract
- `ack_stage`:
  - short response target (<2s preferred)
  - no heavy tools by default
- `deep_stage`:
  - full streaming deltas
  - tool events streamed as structured progress
  - final response sentinel supported (`[[FINAL_RESPONSE]]`) where needed
- UI behavior:
  - immediate ack render
  - deep stream appends below ack
  - final response replaces pending state cleanly.

## 7. Provider-Agnostic Event Contract (Required)
- Every adapter must normalize into:
  - `stage` (`ack` | `deep`)
  - `delta_text`
  - `tool_event` (`use` | `result` | `error`)
  - `usage`
  - `terminal_status`
- Raw provider payloads may be logged in debug only, never required by UI.

## 8. Safety and Cost Controls
- Ack stage token and timeout budgets are strict.
- Deep stage uses normal policy limits for tools/iterations.
- Rate-limit fallback:
  - if deep model unavailable, degrade to ack model with explicit user notice.
- Cost telemetry split by stage:
  - ack tokens/latency
  - deep tokens/latency

## 9. Data and Trace Requirements
- Persist stage-linked run trace:
  - one `run_id` with `stage_id`s, or linked `ack_run_id` -> `deep_run_id`.
- Keep stage attribution in analytics:
  - completion source (`ack` vs `deep`)
  - user interruption/cancel rates per stage.

## 10. Granular Implementation Checklist

### Phase 1 — Contracts
- [ ] Add stage enum (`ack|deep`) to runtime event schema.
- [ ] Add stage-aware run trace records.
- [ ] Add provider profile contract: `profiles.ack`, `profiles.deep`.

### Phase 2 — Runtime Routing
- [ ] Implement lightweight complexity router in `agent_core`.
- [ ] Implement two-stage execution coordinator.
- [ ] Add user override (`quick|deep|auto`) at run start payload.

### Phase 3 — Adapter Mapping
- [ ] Gemini adapter: map ack/deep profiles to concrete model IDs.
- [ ] Add equivalent mapping scaffolds for Codex/OpenAI and local adapters.
- [ ] Add adapter health checks for both profiles.

### Phase 4 — UI Integration
- [ ] Add ack placeholder/instant text lane in chat GUI.
- [ ] Stream deep stage in same turn with clear stage labels.
- [ ] Add settings controls for routing mode and default behavior.

### Phase 5 — Observability
- [ ] Add per-stage latency metrics.
- [ ] Add per-stage token/cost metrics.
- [ ] Add trace debug panel filters by stage.

### Phase 6 — Hardening
- [ ] Add fallback behavior when deep model fails/rate-limits.
- [ ] Add tests for stage switching and cancellation edge cases.
- [ ] Add regression tests ensuring provider-agnostic runtime behavior.

## 11. Non-Goals (V1)
- No provider-specific UX forks.
- No domain-specific stage rules in shared runtime.
- No hardcoding model IDs in runtime core.
