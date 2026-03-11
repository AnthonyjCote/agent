# PDR (Temp) — Comms UI + Agent Tool Unification V1

## Purpose
Unify Comms behavior so manual UI sends and agent tool sends use the exact same backend pathway and produce identical outcomes, while preserving a clean swap path from sandbox adapters to real providers later.

## Problem
- UI path can successfully send internal email/SMS/chat.
- Agent `comms_tool` path can fail on sender/account/thread shape mismatches.
- This creates drift, fragile prompts, and hard-to-debug runtime behavior.

## Core Decisions (Locked)
1. Single send pipeline:
- All outbound send operations (UI + agent tool + future event automation) must call one canonical domain send pathway.
- No parallel “UI-only send logic” vs “tool-only send logic”.

2. Sender is runtime-owned:
- Sender identity is resolved from run context (current operator), never model-controlled.
- Agent/tool input must not include sender account IDs or sender addresses.
- Runtime injects sender account/address deterministically.

3. Model-facing contract is high-level:
- Agent-facing send fields are minimal:
  - Email: `to`, `subject`, `body`
  - SMS: `to`, `body`
  - Chat: `to`, `body`
- Low-level threading/account fields are backend concern.

4. Transport boundary remains strict:
- Domain logic is provider-agnostic.
- Adapter handles provider-specific I/O.
- Sandbox adapters stay fully isolated and swappable with real adapters later.

5. Debug transparency:
- Tool lifecycle events must include full normalized args and sender resolution metadata.
- Failures must include actionable context (`resolvedOperatorId`, `channel`, account/thread resolution details).

6. Agent reads are self-scoped:
- Agent `comms_tool` reads are scoped to the current active operator mailbox context.
- Agents do not specify self IDs to read their own messages.
- Cross-operator mailbox reads are disallowed in V1 unless explicit delegated/admin policy is added.

7. Message read-state parity:
- UI and tool paths must share the same read/unread semantics.
- Read-state changes must be persisted and visible consistently across sessions and surfaces.

## Target Architecture
### A) Canonical Domain API
- Introduce/standardize one send contract in comms domain, e.g.:
  - `send_message(channel, sender_operator_id, to, subject?, body, reply_to?)`
- Used by:
  - Comms UI commands
  - `comms_tool` create/send operations
  - future event-triggered work units

### B) Tool-to-domain mapping
- `comms_tool` remains batch-capable, but send ops are normalized to canonical send calls.
- Runtime preprocess handles:
  - sender scoping
  - channel inference when omitted
  - thread alias handling (e.g. `"new"` placeholder)
- Domain handles deterministic write ordering and delivery.

### C) Provider adapter seam
- `CommsDeliveryService` routes channel send to configured adapter.
- Current:
  - `SandboxEmailAdapter`
  - `SandboxSmsAdapter`
  - `InternalChatAdapter`
- Future:
  - real email provider adapter(s)
  - real sms provider adapter(s)
  - external chat provider adapters
- No agent/tool/UI contract rewrite required for provider swap.

## Identity + Mapping Rules
1. Canonical sender key:
- Runs must carry `agent_operator_id` (or equivalent canonical operator ID).
- Sender account resolution keys off canonical operator identity.

2. Account auto-provision policy:
- If operator lacks required channel account, backend may auto-provision deterministically (policy-controlled).
- Auto-provision must be identical regardless of UI vs tool initiation.

3. Thread ownership policy:
- Outbound sends can only originate from sender-owned account/thread context.
- If counterpart thread is referenced, backend may remap via deterministic thread key rules.

## Comms Tool Contract (Model-Facing V1)
### Read
- Directory/contact lookup and thread/message reads remain supported.

### Create (send)
- Email send payload:
```json
{
  "ops": [
    {
      "action": "create",
      "target": "message",
      "payload": {
        "channel": "email",
        "toParticipants": ["donna.hedgeson@agentdeck.io"],
        "subject": "Subject",
        "bodyText": "Body"
      }
    }
  ]
}
```
- SMS send payload:
```json
{
  "ops": [
    {
      "action": "create",
      "target": "message",
      "payload": {
        "channel": "sms",
        "toParticipants": ["+15551234567"],
        "bodyText": "Body"
      }
    }
  ]
}
```
- Chat send payload:
```json
{
  "ops": [
    {
      "action": "create",
      "target": "message",
      "payload": {
        "channel": "chat",
        "toParticipants": ["@donna.hedgeson"],
        "bodyText": "Body"
      }
    }
  ]
}
```

Notes:
- Sender fields are forbidden model inputs (ignored or rejected).
- `threadId` is optional for send; backend may create/find sender thread deterministically.

## UI/Tool Parity Requirements
1. If a UI send succeeds, equivalent tool send with same channel/recipient/content must succeed.
2. Folder/thread outcomes (`sent`, `inbox`, delivery event logs) must match across initiation source.
3. Resolution and validation errors must be identical across UI and tool paths.
4. UI read/unread toggles must update canonical message state and be reflected in tool reads.

## UI Read/Unread Controls (Locked for V1)
- Email UI supports:
  - `mark read`
  - `mark unread`
- Actions are user-controlled and persist to canonical comms state.
- Read/unread state must survive reload/restart and be reflected in list/detail views.
- Tool reads should expose read-state so agents can prioritize unread follow-ups in their own inbox context.

## Observability Requirements
- `tool_use` and `tool_result` carry normalized args.
- `debug_tool_result` includes:
  - sender operator id used
  - sender account id/address used
  - channel inferred/resolved
  - thread resolution/remap details
  - delivery adapter used

## Migration Path to Real Providers
1. Keep canonical comms storage and send contract unchanged.
2. Replace adapter implementation only (`sandbox` -> `provider`).
3. Continue writing canonical threads/messages/events regardless of provider.
4. Preserve sender scoping and authorization semantics unchanged.

## Implementation Checklist
- [ ] Add canonical sender operator identity in run context and runtime metadata.
- [ ] Move all send paths (UI + tool) onto shared comms domain send API.
- [ ] Remove sender/account requirements from model-facing tool instructions.
- [ ] Normalize `threadId: "new"` and channel inference consistently in shared layer.
- [ ] Add deterministic account auto-provision policy hook for missing channel accounts.
- [ ] Enforce thread/account ownership guardrails uniformly.
- [ ] Expand debug event payloads with normalized args + sender resolution metadata.
- [ ] Enforce self-scoped mailbox reads for agent tool queries (no cross-account reads by default).
- [ ] Add message read-state persistence (`read/unread`) and UI controls (`mark read`, `mark unread`).
- [ ] Add parity tests: UI send vs tool send equivalence by channel.
- [ ] Add parity tests: UI read/unread actions reflected in comms tool read results.
- [ ] Add adapter contract tests proving provider swap without contract changes.

## Acceptance Criteria
1. Agent can send email/SMS/chat with minimal payload (recipient + content) from desktop runtime without sender/account failures.
2. Same recipient/content from UI and tool produce equivalent persisted outcomes.
3. Debug log shows full tool args and sender/channel/thread resolution details.
4. Swapping transport adapter does not change UI or agent tool contract.
5. Agents can check only their own mailbox context by default and can read unread/recent messages reliably.
6. Users can mark email messages read/unread in UI, and state remains consistent after reload.
