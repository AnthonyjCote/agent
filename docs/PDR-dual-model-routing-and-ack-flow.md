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
- Accepts ack-stage structured routing output with:
  - `decision` (`ack_only` | `handoff_deep_default` | `handoff_deep_escalate`)
  - `ack_text` (short user-facing response)
  - `prefetch_tools` (optional array of tool IDs likely needed by deep stage)
- If handoff is selected, pre-expands schemas for validated `prefetch_tools` before deep call.
- Emits canonical events:
  - `ack_started`, `ack_delta`, `ack_completed`
  - `deep_started`, `model_delta`, `tool_use`, `tool_result`, `run_completed`, `run_failed`
- Never references provider model IDs directly.

### 3.2 Provider Adapter Layer (provider-specific)
- Maps logical profile names to concrete models:
  - `profile_ack`
  - `profile_deep_default`
  - `profile_deep_escalate`
- Examples:
  - Gemini: `gemini-2.5-flash-lite` -> `gemini-3-flash-preview` -> `gemini-3-pro-preview`
  - OpenAI/Codex: `gpt-5.1-mini` -> `gpt-5.4` -> `gpt-5.4-max`
  - Local: `3b-instruct` -> `34b/70b-instruct` -> `80b+`
- Handles provider-native stream parsing and tool semantics.

### 3.3 Config Layer
- Shared runtime config fields (provider-agnostic):
  - `routing.enabled`
  - `routing.ack_timeout_ms`
  - `routing.deep_auto_start`
  - `routing.deep_trigger_policy`
- Provider config fields:
  - `providers.<id>.profiles.ack`
  - `providers.<id>.profiles.deep_default`
  - `providers.<id>.profiles.deep_escalate`

## 4. UX Flow
1. User sends message.
2. Runtime starts `ack_stage` immediately.
3. UI shows instant ack text and status.
4. Runtime chooses one path:
- `ack_only`: ack is final, run completes.
- `handoff_deep_default`: deep-default stage starts and streams progress/final output.
- `handoff_deep_escalate`: deep-escalated stage starts and streams progress/final output.
  - clarification questions (when needed) are handled inside `ack_only`.
5. UI shows deep stream in same conversation turn (or linked follow-up turn per policy).

## 5. Routing Policy (V1)
- Ack model determines routing output directly (no deterministic classifier in runtime).
- Routing outputs are limited to:
  - `ack_only`
  - `handoff_deep_default`
  - `handoff_deep_escalate`
- Clarification behavior is part of `ack_only`:
  - if request is ambiguous/underspecified, ask exactly one highest-leverage clarification question.
  - do not ask multi-question forms in one turn.
  - if confidence is sufficient, either answer in ack or hand off to the appropriate deep tier.
- Ack routing is the single authority for deep tier selection in V1.
- Runtime validates ack routing schema; invalid output falls back to `handoff_deep_default`.
- Tool pre-warm policy:
  - ack may return `prefetch_tools` to reduce deep-stage schema fetch round trips.
  - runtime validates each tool ID against allowed tools.
  - runtime deduplicates and caps `prefetch_tools` to 5.
  - deep stage can still request additional tool schemas on demand when needed.
- Deep-tier triage policy:
  - selected directly by ack routing decision (`handoff_deep_default` or `handoff_deep_escalate`).
  - runtime does not run an additional deep-tier classifier in V1.
- Hard override controls:
  - user toggle `Quick` / `Deep`
  - agent profile default mode.
- Override precedence (final decision order):
  - explicit user override
  - valid ack routing decision
  - runtime default (`handoff_deep_default`)

## 6. Streaming and Finalization Contract
- `ack_stage`:
  - short response target (<2s preferred)
  - no heavy tools by default
  - strict routing envelope required (machine-parseable JSON object):
    - `decision`: `ack_only | handoff_deep_default | handoff_deep_escalate`
    - `ack_text`: short user-facing text
    - `prefetch_tools`: optional tool ID array (max 5 after runtime validation)
  - invalid/malformed ack envelope fallback:
    - set decision to `handoff_deep_default`
    - set `ack_text` to a compact runtime-generated fallback status line
- `deep_stage`:
  - full streaming deltas
  - tool events streamed as structured progress
  - final response sentinel supported (`[[FINAL_RESPONSE]]`) where needed
  - if deep work requires continuation, runtime re-runs `ack_stage` first to publish a short progress/status update before next deep pass.
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
- V1 decision: no deep-escalate guardrails yet; evaluate behavior in testing and add only if needed.

## 9. Data and Trace Requirements
- Persist stage-linked run trace:
  - one `run_id` with `stage_id`s, or linked `ack_run_id` -> `deep_run_id`.
- Keep stage attribution in analytics:
  - completion source (`ack` vs `deep`)
  - user interruption/cancel rates per stage.
- Minimum telemetry for V1:
  - routing decision selected (`ack_only | handoff_deep_default | handoff_deep_escalate`)
  - concrete model used for each stage
  - per-stage latency
  - prefetch tool IDs proposed vs accepted vs used

## 10. Granular Implementation Checklist

### Phase 1 — Contracts
- [ ] Add stage enum (`ack|deep`) to runtime event schema.
- [ ] Add stage-aware run trace records.
- [ ] Add provider profile contract: `profiles.ack`, `profiles.deep_default`, `profiles.deep_escalate`.
- [ ] Add ack routing schema contract fields: `decision`, `ack_text`, `prefetch_tools` where decision is one of `ack_only | handoff_deep_default | handoff_deep_escalate`.

### Phase 2 — Runtime Routing
- [ ] Implement ack-stage routing contract in `agent_core` (ack model returns routing decision).
- [ ] Implement `ack_only | handoff_deep_default | handoff_deep_escalate` outcomes.
- [ ] Encode clarification as `ack_only` behavior in ack prompt instructions.
- [ ] Enforce one-question clarification rule in ack instruction and response validation.
- [ ] Enforce strict ack envelope parse+validation and malformed fallback to `handoff_deep_default`.
- [ ] Implement override precedence: user override > ack decision > runtime default.
- [ ] Implement `prefetch_tools` validation, dedupe, and cap at 5.
- [ ] Pre-expand only validated prefetched tool schemas before deep stage starts.
- [ ] Implement two-stage execution coordinator.
- [ ] Implement continuation flow: if deep needs more work, run ack status update before next deep pass.
- [ ] Add user override (`quick|deep|auto`) at run start payload.

### Phase 3 — Adapter Mapping
- [ ] Gemini adapter mapping:
  - `ack` = `gemini-2.5-flash-lite`
  - `deep_default` = `gemini-3-flash-preview`
  - `deep_escalate` = `gemini-3-pro-preview`
- [ ] Add equivalent mapping scaffolds for Codex/OpenAI and local adapters.
- [ ] Add adapter health checks for all configured profiles.

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
