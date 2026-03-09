# PDR Comms Domain V1

## Purpose
Build a production-grade internal communications domain that supports operator inbox/outbox workflows for Email, Chat, and SMS, while preserving a clean adapter seam for future real-world provider I/O.

V1 is sandbox-first, but architected so agents and humans use the same communication primitives regardless of whether transport is internal simulation or external provider.

## Core Decision
Comms is one canonical domain with multiple channel renderers, not separate per-channel backends.

Channels in V1:
- `email`
- `chat`
- `sms`

All channels share the same core objects and dispatch/tooling contracts.

## Goals (V1)
- Human-usable comms UI for Email, Chat, SMS.
- Per-operator inbox/outbox behavior across channels.
- Threaded conversations with realistic channel semantics.
- Agent-accessible comms tool for read/send/reply actions.
- Trigger hooks that emit `work_unit` automation tasks from inbound messages.
- Full sandbox operation (no external provider dependency).

## Non-Goals (V1)
- Voice/video calling.
- External provider integrations (SMTP/IMAP/Twilio/Slack/Teams).
- Rich attachment workflows beyond metadata placeholders.
- Advanced anti-spam/abuse filtering.

## Canonical Data Model

### 1. `comms_account`
Represents an operator’s identity on a channel.

Fields:
- `id`
- `operator_name_ref`
- `channel` (`email|chat|sms`)
- `address` (email address, chat handle, phone-like id)
- `display_name`
- `status` (`active|disabled`)
- `provider` (`sandbox` in V1)
- `provider_config_ref` (optional)

### 2. `thread`
Conversation container.

Fields:
- `id`
- `channel`
- `subject` (email optional/required by policy)
- `thread_key` (for reply-chain continuity)
- `participants` (refs)
- `state` (`open|closed|archived|spam`)
- `folder` (email-centric views)
- `created_at`
- `updated_at`
- `last_message_at`

### 3. `message`
Atomic communication unit.

Fields:
- `id`
- `thread_id`
- `channel`
- `direction` (`inbound|outbound|internal`)
- `from_account_ref`
- `to_participants`
- `cc_participants` (email only)
- `bcc_participants` (email only)
- `body_text`
- `subject` (email)
- `reply_to_message_id` (optional)
- `external_message_ref` (optional)
- `created_at`

### 4. `delivery_event`
Delivery lifecycle telemetry.

Fields:
- `id`
- `message_id`
- `status` (`queued|sent|delivered|failed|read`)
- `error_code` (optional)
- `error_message` (optional)
- `created_at`

### 5. `participant`
Normalized participant identity for a thread/message.

Fields:
- `id`
- `kind` (`operator|external_contact|group`)
- `name`
- `address`
- `operator_name_ref` (optional)

## Channel Behavior Matrix

### Email
- Supports folders: inbox, drafts, sent, spam, archive, trash.
- Threading via `thread_key` + reply linkage.
- Subject required by default.
- UI modeled after familiar mail clients.

### Chat
- Supports direct and group conversation threads.
- Message stream style; no folder-centric model.
- Optional mention metadata in `message` extension payload.

### SMS
- Thread per counterpart or group-like simulation.
- Body length policy and segment metadata supported in adapter layer.
- Optional phone-frame preview renderer in UI.

## Adapter Architecture
Single adapter interface behind domain operations:
- `sandbox` adapter in V1 for all channels.
- Future adapters plug into same interface for external I/O.

Adapter responsibilities:
- transport send/receive
- delivery status mapping
- provider error normalization
- optional provider-side id mapping

Canonical domain remains source of truth for UI and agent tooling.

## Automation and Trigger Integration
Comms emits domain events and maps triggers to `work_unit` via shared domain automation contract.

Examples:
- `comms.message_received` -> `action_type=reply_to_message`
- `comms.message_received` + policy conditions -> `action_type=triage_inbound_message`
- `comms.delivery_failed` -> `action_type=retry_or_escalate_delivery`

All automated work uses:
- `dispatchWorkUnit(workUnit, options)`
- shared runtime path used by Chat GUI

## Agent Tool Contract (Shared Shape, Domain-Specific Targets)
Tooling must follow the same logical shape already used by org chart tooling:
- batched `ops: []`
- consistent action model (`read|create|edit|delete`)
- deterministic per-op result records
- optional atomic write semantics for batch mutations

Comms tool identity (locked):
- `tool_id`: `comms_tool` (machine-stable)
- `tool_label`: `Comms Tool` (UI-facing display text)

UI rendering rule:
- runtime/debug UI should display `tool_label` (for example `Using Comms Tool`) rather than raw `tool_id`.

### Canonical Input Shape (V1)
```json
{
  "ops": [
    {
      "action": "read|create|edit|delete",
      "target": "thread|message|account|participant",
      "selector": { "..." : "target-specific selector fields" },
      "payload": { "..." : "write/edit fields when applicable" }
    }
  ],
  "atomic": false
}
```

### Selector Strategy
- Keep concept consistent with other domain tools.
- Allow both:
  - name refs (ergonomic reads/writes)
  - IDs (required for precise message/thread selection)

Comms precision note:
- Unlike org chart, comms workflows often require exact message/thread targeting.
- Message/thread IDs are first-class for selectors in V1.

### Output Contract
- compact model-facing summaries by default
- structured per-op result array for deterministic automation handling
- normalized error codes suitable for retry decisions

## UI Architecture (Global Top Rail Tabs)

Top-level tabs:
1. Email
2. Chat
3. SMS

### Email Tab
- Left: folder nav + account context
- Right: list/detail behavior like standard email clients
- Threaded message reading and composing

### Chat Tab
- Left: direct/group thread list
- Right: live-style chat history and composer
- Operator and group context cues

### SMS Tab
- Left: SMS thread list
- Right: SMS conversation view
- Optional toggle: phone-frame preview with simulated mobile rendering

## Permissions and Identity
- Each operator has channel-scoped accounts/inboxes.
- Human and agent operators use same comms model.
- Tool policy controls who can send/read on behalf of whom.

## Observability and Audit
Must log:
- message create/update state transitions
- send/reply attempts
- delivery lifecycle events
- automation trigger emissions
- work unit linkage (`source_event_id`, `correlation_id`)

## Minimal Tables (V1)
- `comms_accounts`
- `threads`
- `messages`
- `participants`
- `delivery_events`
- `thread_memberships` (optional if normalized separately)
- `comms_audit_events`

## Acceptance Criteria
- Email/Chat/SMS tabs are functional and internally consistent.
- Operators can send/read/reply in sandbox across channels.
- Agents can perform comms actions via `comms_manage_v1`.
- Inbound comms can emit valid `work_unit` triggers.
- Domain works fully in sandbox mode without external provider dependencies.
- Adapter seam exists so external provider integration can be added without schema rewrite.

## Implementation Phases
1. canonical schema and sandbox adapter
2. comms domain service + read/write APIs
3. `comms_manage_v1` tool integration
4. Email/Chat/SMS tab UIs
5. trigger -> `work_unit` emission wiring
6. telemetry/audit hardening
