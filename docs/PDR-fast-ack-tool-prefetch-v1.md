# PDR: Fast-Ack Tool Prefetch v1

## Purpose
Define a provider-agnostic fast-ack prefetch contract that deterministically prepares deep-stage context so the deep model can execute high-confidence work on first call.

## Scope
- Fast-ack output contract for tool prefetch.
- Runtime prefetch execution behavior.
- Deep-stage context packetization rules.
- Ambiguity handling and clarification gating.

## Non-Goals (v1)
- Domain-specific tool semantics (kept in each tool/domain PDR).
- Provider-specific model routing internals (covered by adapter/runtime PDRs).

## Contract
Fast-ack output includes `prefetch_tools` as structured objects (not only string IDs).

### `prefetch_tools` object shape
- `tool`: tool id
- `intent`: deterministic intent label
- `args`: intent-specific compact args

Example:
```json
{
  "decision": "handoff_deep_default",
  "ack_text": "On it. I’ll prepare that now.",
  "prefetch_tools": [
    {
      "tool": "comms_tool",
      "intent": "message_send",
      "args": {
        "method": "email",
        "recipient_ref": "Satoshi"
      }
    }
  ]
}
```

## Runtime Behavior
For each prefetch entry:
1. Validate `tool` + `intent` + `args`.
2. Execute deterministic prefetch resolution, including tool-owned business-logic enrichment.
3. Build a compact `Resolved Prefetch` context block.
4. Inject only relevant expanded tool instructions into deep prompt.

Comms `message_check` fast-path (locked):
- If filters resolve to one clear thread match, prefetch must also execute `read messages` for that thread in prefetch stage.
- Deep context packet must include:
  - `recommended_thread_id`
  - `recommended_thread_summary` (compact)
  - `prefetched_messages` (bounded payload)
- Deep stage should then act directly on the prefetched message context without a discovery/search step.

If prefetch resolution fails for ambiguity/missing intent args:
- Return a structured clarification requirement.
- Do not start deep stage until clarified.

## Context Packetization Rules
- Deep stage receives only context packets relevant to the resolved prefetch combination.
- No unrelated schema payloads should be injected.
- Keep prefetch outputs compact and bounded.

Required output structure per packet:
- `prefetch_id`
- `tool`
- `intent`
- `status` (`resolved|ambiguous|missing_input|error`)
- `resolved_data` (compact, method-specific)
- `clarification_prompt` (only when needed)

## Clarification Policy
Fast-ack handles clarification when required by prefetch.
- Ask exactly one short clarification question.
- Stay in `ack_only` until resolved.
- Avoid handing ambiguous work to deep.

## Safety and Determinism
- Prefetch only allowed tools.
- No side-effect writes in prefetch stage (read/resolve only).
- Runtime owns deterministic resolution; model should not guess identifiers.

## Deterministic Business-Logic Enrichment (Explicit)
Prefetch accepts simplified model inputs and performs deterministic backend enrichment before deep handoff.

Examples:
- `comms_tool` + `intent=message_send`
  - simplified args: `method`, `recipient_ref`
  - deterministic enrichment:
    - resolve recipient candidates from internal contacts
    - return method-relevant destination fields and send schema packet
  - no extra explicit lookup tool call required from deep model for standard cases

- `comms_tool` + `intent=message_check`
  - simplified args: `method`, optional `folder`, optional `query`
  - deterministic enrichment:
    - run structured thread filtering in current-operator mailbox scope
    - return ranked compact candidates
    - if one clear candidate, prefetch message content and inject direct-action packet
  - no method fallback; missing channel/method must trigger single clarification question in ack stage (`ack_only`)

Source-of-truth resolution path:
- v1: operator directory/contact records
- planned extension: operators + CRM contacts

All enrichment outputs must include:
- confidence score(s)
- ambiguity status
- clarification requirement when unresolved

## Performance Controls
- Cap prefetch result sizes (e.g., top 3-5 candidates).
- Support field projection for minimal payloads.
- Prefer one prefetch pass per user turn unless unresolved.

## Rolling Notes
### 2026-03-10
- Introduced structured `prefetch_tools` object contract (`tool`, `intent`, `args`).
- Locked runtime packetization requirement: inject only relevant deep context.
- Locked clarification gate: unresolved prefetch must not hand off to deep.
