# PDR-temp-tool-use-regression-repair-v1

## Purpose
Repair the current tool-use regression so fast-ack returns to strict acknowledgement + routing behavior, while preserving dynamic toolbox prefetch expansion for deep-stage first-pass efficiency.

This PDR is also the rolling execution tracker until both core domains below are stable enough to call "done for now":
- Comms Tool (`comms_tool`)
- Org Chart Tool (`org_manage_entities_v2`)

## Current Regression Summary
- Ack stage is emitting provider-native `tool_use` events.
- Ack model is attempting real tool calls instead of returning strict decision JSON.
- This breaks handoff, causes invalid ack-only clarifications, and regresses prefetch flow.

## Desired Runtime Contract (Locked)
1. Ack stage is routing-only:
- Output must be strict JSON decision envelope only.
- No provider tool calling.
- No app tool calling.
- No native web search.

2. Toolbox expansion remains active:
- Ack still emits `prefetch_tools` (with structured args when needed).
- Prefetch expansion is backend-internal only (`run_prefetch_gate` path).
- Expanded packets are injected into deep stage context.

3. Deep stage remains tool-capable:
- Deep model can call app tools and native search (when gated on).
- Iterative deep loops may request additional prefetch expansion through runtime-managed flow, not provider-tool execution in ack.

## Implementation Plan

### A) Ack Runtime Hardening
- Enforce ack profile with tools disabled at provider request/config layer.
- Treat any ack-stage `tool_use` / tool envelope output as invalid ack response.
- Ack parser accepts only schema:
  - `decision`
  - `ack_text`
  - `prefetch_tools`
  - `requires_web_search`
- Add one bounded retry on invalid ack output with compact corrective suffix.
- If still invalid: fail gracefully with non-impersonating error event (no canned agent text).

### B) Prefetch Ownership Clarification
- Keep `toolbox_prefetch` as internal runtime resolver only (not model-callable surface).
- Preserve structured prefetch specs:
  - Comms send/check intent
  - Method-specific args
  - Recipient/query hints
- Preserve method-specific context packet injection to deep stage.

### C) Debug/Trace Clarity
- Add explicit debug marker for ack decision parsing result:
  - `ack_decision_parsed`
  - `ack_decision_invalid`
- Ensure ack trace does not show misleading provider tool lifecycle as valid app-tool path.

## Rolling Task Sections

### Rolling Tasks - Ack + Prefetch Stability
- [ ] Confirm ack never emits tool lifecycle events in runtime logs.
- [ ] Confirm ack returns strict JSON across trivial, ambiguous, and tool-required prompts.
- [ ] Confirm structured prefetch args survive parsing (including comms intents).
- [ ] Confirm deep receives packetized prefetch context in first deep step.
- [ ] Confirm no deterministic/canned agent-voice fallback strings are emitted.

### Rolling Tasks - Comms Tool Edge Cases
- [ ] One-step send contract only (no required pre-create thread for outbound send).
- [ ] Sender identity auto-scoped to active operator; no sender ID required from model.
- [ ] Read/check self-scope enforced; cross-mailbox reads blocked.
- [ ] Search behavior supports practical partial/fuzzy participant matching.
- [ ] Fast path: exact single-match prefetch can include opened thread/message payload for deep.
- [ ] Ensure message routing parity between tool path and UI path (outbox/inbox placement).
- [ ] Validate read/unread state operations remain correct.

### Rolling Tasks - Org Chart Tool Edge Cases
- [ ] Delete operations remain deterministic and final (no reappearance via sync loop).
- [ ] Manifest-org sync cannot remap deleted entities unexpectedly.
- [ ] Unassigned behavior remains explicit and non-destructive.
- [ ] Batch writes keep predictable validation and error semantics.
- [ ] Name-ref ergonomics remain model-friendly while backend IDs stay internal.

## Exit Criteria ("Done for now")
- Ack stage is stable and routing-only with zero tool-call leakage.
- Prefetch-driven deep first-pass success improves (fewer unnecessary deep tool calls).
- Comms and Org tools both pass edge-case regression checks listed above.
- No high-severity regressions observed in desktop test loop across at least:
  - send/check comms workflows
  - org create/update/delete workflows

## Non-Goals
- Full event orchestration queue implementation.
- New domain launches beyond comms/org stabilization.
- Broad UX redesign unrelated to regression repair.

