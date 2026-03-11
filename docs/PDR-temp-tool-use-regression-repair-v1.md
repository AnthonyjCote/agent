# PDR-temp-tool-use-regression-repair-v1

## Append-Only Format
- This PDR uses compact append blocks.
- New updates must be added as new blocks at the end.
- Existing blocks are immutable except typo fixes.

---

## Block 001 - Locked Ack Simplification Decisions
### Goal
Stabilize fast-ack behavior for weak models by minimizing schema complexity and moving enrichment logic to backend runtime.

### Locked Schema (Ack Output)
```json
{
  "decision": "ack_only|handoff_deep_default|handoff_deep_escalate",
  "ack_text": "short user-facing text",
  "target_domains": ["comms|org|calendar|tasks|websearch"],
  "primary_intent": "read|write|edit|analyze|mixed|unknown",
  "named_entities": ["..."],
  "filter_keywords": ["..."],
  "relative_dates": ["..."]
}
```

### Locked Rules
- `target_domains` replaces tool-level planning in ack.
- `websearch` is represented as a domain (remove standalone boolean flag).
- `primary_intent` supports `mixed` for compound requests.
- Ack extracts only high-confidence hints from user prompt + recent context.
- Ack does not execute, draft, solve, or recommend.
- Backend maps domains -> tools and performs deterministic prefetch expansion for deep stage.

---

## Block 002 - Backend Implementation Scope
### A) Ack Prompt / Parser Refactor
- Replace current ack prompt with compact protocol format aligned to locked schema.
- Remove prompt references that imply direct tool usage.
- Update ack parser to accept only locked schema keys.
- Remove old ack fields:
  - `prefetch_tools`
  - `expansions`
  - `requires_web_search`

### B) Domain-to-Tool Mapping Layer
- Add runtime mapper:
  - `target_domains` + `primary_intent` + entity/filter/date hints
  - => deterministic prefetch specs + deep context packets
- Keep mapper backend-owned and provider-agnostic.

### C) Dynamic Expansion Preservation
- Keep comms prefetch behavior:
  - recipient resolution
  - thread/message pre-open for checks
  - one-step send contract hints
- Add org-prefetch routing from simplified hints:
  - snapshot / unit / operator reads based on entities + intent.

### D) Ack Guardrails
- Ack stage must not run tools.
- Reject/repair invalid ack outputs with bounded retry.
- Preserve strict JSON-only ack contract.

### E) Debug/Observability
- Keep provider stream merge block for easier diagnosis.
- Add clear ack parse success/failure markers.

---

## Implementation Checklist
- [ ] Rewrite ack prompt to locked schema + compact protocol wording.
- [ ] Refactor ack parser to locked schema only.
- [ ] Remove legacy ack fields from parser, prompt, and downstream runtime contracts.
- [ ] Implement domain-to-tool mapping module in runtime.
- [ ] Rewire prefetch gate to consume mapped specs from new ack schema.
- [ ] Keep comms dynamic expansion behavior parity after rewire.
- [ ] Add org dynamic expansion path from simplified hints.
- [ ] Update deep prompt assembly to consume new mapped packets.
- [ ] Add/adjust debug events for new ack contract and mapping output.
- [ ] Run desktop smoke tests:
  - [ ] Comms send flow
  - [ ] Comms check/reply flow
  - [ ] Org read/mutate planning flow
  - [ ] Mixed-intent task dump routing flow

---

## Exit Criteria (This Phase)
- Ack outputs the locked schema reliably.
- Ack no longer leaks into execution behavior.
- Deep receives equivalent or better first-pass context for comms and org than prior system.
- No regressions in desktop chat workflow for core comms/org use cases.
