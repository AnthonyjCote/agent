# PDR Comms Sandbox-to-Provider Transport V1

## Purpose
Define a clean transport architecture so Email in V1 behaves like a real system in sandbox mode (internal send/receive between org operators), while keeping a direct migration path to real provider I/O later (prospecting, support, customer ops).

This PDR is transport-focused. It does not replace the broader Comms domain PDR.

## Core Decision
Comms data in our runtime remains canonical. Transport and adapter layers are strictly separated.

- Canonical source of truth: `comms_accounts`, `comms_threads`, `comms_messages`, `comms_delivery_events`.
- Transport abstraction: swappable implementation (`sandbox` now, real provider later).
- UI, tools, and agent automation target canonical comms APIs only.
- `CommsDeliveryService` (transport layer) is orchestration-only: it routes, validates shared envelope, records common telemetry, and delegates delivery.
- Sandbox behavior is fully contained in `SandboxEmailAdapter` (adapter layer): internal recipient resolution, mailbox write rules, and sandbox-specific thread delivery.
- No sandbox/internal delivery logic is allowed in `CommsDeliveryService`.

## Goals (V1)
- Sending an internal email from operator A to operator B actually delivers to B inbox.
- Sender sees sent copy in their mailbox (`sent`), recipient sees inbound in their mailbox (`inbox`).
- Reply/forward behavior stays mailbox/thread coherent.
- Delivery lifecycle is recorded for debugging and traceability.
- Same flow can switch to real provider adapter later without UI/tool contract rewrite.
- SMS follows the same transport/adapter architecture and canonical APIs as email.
- SMS sandbox mode supports real send/receive simulation between operators by phone number.

## Non-Goals (V1)
- Full external SMTP/IMAP integration.
- DKIM/SPF/DMARC concerns.
- Advanced mailbox sync conflict handling.
- Contact dedupe across external CRMs.

## Transport Interface (Locked)
Backend service boundary:

- `sendEmail(input) -> SendEmailResult`
- `ingestInboundEmail(input) -> IngestResult` (stub now, used later for provider webhooks/polling)
- `sendSms(input) -> SendSmsResult`
- `ingestInboundSms(input) -> IngestResult` (stub now, used later for provider webhooks/polling)

Where:
- `input` is normalized comms envelope (not provider-native payload).
- `result` includes per-recipient delivery status and canonical IDs.

## Layering Contract (Locked)
### Transport Layer (`CommsDeliveryService`)
- Chooses adapter by config (`COMMS_EMAIL_TRANSPORT`).
- Executes shared envelope validation and cross-adapter telemetry envelope.
- Delegates all delivery behavior to adapter.
- Must not branch on sandbox mailbox semantics.
- Owns channel routing only (`email`/`sms`), not sandbox delivery behavior.

### Adapter Layer (`SandboxEmailAdapter`, future provider adapters)
- Implements channel/provider behavior.
- Sandbox adapter owns all local/internal routing logic.
- Provider adapter owns all external API/webhook logic.
- Returns normalized results back to transport layer.
- SMS follows identical separation:
  - `SandboxSmsAdapter` owns all internal number resolution and inbox delivery semantics.
  - future provider SMS adapter owns all external API/webhook semantics.

## Canonical Envelope Shape (V1)
```json
{
  "channel": "email",
  "from_account_id": "acct_email_op_xxx",
  "subject": "string",
  "body_text": "string",
  "to": ["address@domain"],
  "cc": ["optional@domain"],
  "bcc": ["optional@domain"],
  "reply_to_message_id": "optional"
}
```

SMS envelope:
```json
{
  "channel": "sms",
  "from_account_id": "acct_sms_op_xxx",
  "to": ["+1555XXXXXXX"],
  "body_text": "string",
  "reply_to_message_id": "optional"
}
```

## Addressing Rule (Locked for V1)
Sandbox operator email format:

- `firstname.lastname@businessunitname`

Notes:
- no extension rewrite in V1.
- business unit value is used as-is after normalization.
- IDs are backend-only, never model-facing in prompts.

Sandbox operator SMS format:
- stable unique sandbox number per operator (backend-authoritative in `comms_accounts.address`).
- never frontend-generated.
- example: `+1555XXXXXXX`.

## Internal Delivery Semantics (Sandbox Adapter Only)
When user sends email:

1. Resolve sender account from active operator context.
2. Parse recipients (`to`, `cc`, `bcc`).
3. For each recipient:
   - resolve to internal operator/account if address matches canonical operator email.
   - if unresolved external address, mark unresolved delivery event (no-op send in V1).
4. For internal recipients:
   - create/find recipient thread in recipient mailbox (`folder=inbox`).
   - append inbound message in recipient thread.
5. For sender:
   - create/find sender thread in sender mailbox (`folder=sent`).
   - append outbound message in sender thread.
6. Write delivery events for all recipients.

### SMS Delivery Semantics (Sandbox Adapter Only)
When user sends SMS:

1. Resolve sender SMS account from active operator context.
2. Resolve recipient by phone number against internal SMS accounts.
3. If unresolved, record unresolved delivery event (no-op send in V1).
4. If resolved, append outbound in sender account context and inbound in recipient account context.
5. Delivery must use one canonical thread per `(account_id + peer_number)` pair.
6. Write delivery events for send attempt and final status.

## Threading Rules (V1)
- Primary thread continuity uses canonical `thread_key` + subject heuristics.
- Reply path can continue existing thread when target context exists.
- If ambiguous, create a new thread and preserve `reply_to_message_id`.

## Folder Rules (V1)
- `inbox`: inbound recipient mail.
- `sent`: sender copy of outbound messages.
- `archive`: mailbox-local archive.
- `trash`: mailbox-local soft delete.
- `delete` in `trash`: permanent thread delete from that mailbox context.

## Event and Automation Integration
Each successful internal inbound should emit a comms domain event:

- `comms.email.received`

Mapped to work-unit path:

- `domain: "comms"`
- `actionType: "reply_to_message"` or policy-selected action
- `targetOperator`: recipient operator name ref

This keeps manual chat-triggered runs and event-triggered runs on the same runtime path.

## Provider Migration Path (No Rewrite)
When real provider I/O is enabled:

- keep canonical storage unchanged.
- keep `CommsDeliveryService` unchanged, swap adapter from `SandboxEmailAdapter` to provider adapter.
- provider adapter responsibilities:
  - send via provider API/SMTP
  - normalize provider webhooks/inbound payloads
  - map provider IDs into `external_message_ref`
  - map provider statuses into canonical `delivery_events`

UI and tools do not change.

SMS follows the same migration path:
- swap `SandboxSmsAdapter` to provider SMS adapter.
- preserve canonical accounts/threads/messages/events contract.
- allow manual per-operator phone assignment (org chart settings) to become provider-facing source of truth.

## Configuration (V1+)
Transport mode toggle:

- `COMMS_EMAIL_TRANSPORT=sandbox|provider`
- `COMMS_SMS_TRANSPORT=sandbox|provider`

Provider settings can be layered later:
- per-account provider config refs
- workspace/provider credentials
- rate limits and retries

## Observability Requirements
Must log:
- send attempts with correlation IDs
- per-recipient resolution result (`internal`, `external_unresolved`, `failed`)
- canonical message/thread IDs created
- delivery lifecycle transitions
- emitted domain event IDs

## Acceptance Criteria
1. Compose from operator A to operator B internal address delivers into B inbox.
2. A has outbound copy in `sent`.
3. B can reply and reply reaches A inbox.
4. Delete to trash stays in current folder view; permanent delete only from trash.
5. `delivery_events` contain deterministic per-recipient statuses.
6. Switching transport mode does not require UI/schema/tool contract changes.
7. SMS send in sandbox delivers to recipient operator SMS inbox by phone number.
8. SMS threads stay coherent as one thread per peer number pair.
9. Active operator can compose new SMS via modal (`to number` + `message` + contacts picker) and delivery follows same canonical pipeline.

## Implementation Checklist
1. Add backend `CommsDeliveryService` with transport interface.
2. Add `SandboxEmailTransport` implementation.
3. Add address resolver (`address -> internal account/operator or unresolved`).
4. Route compose send through delivery service instead of direct single-thread append.
5. Write sender/recipient mailbox entries according to folder semantics.
6. Emit canonical delivery events and `comms.email.received`.
7. Keep `provider` transport stub contract ready for next phase.
8. Add `sendSms` orchestration path in transport layer.
9. Add `SandboxSmsAdapter` with stable internal number resolution and one-thread-per-number semantics.
10. Make backend comms account provisioning authoritative for SMS numbers (stable + unique).
11. Add manual phone override path (org chart field) for future provider mode without changing comms APIs.
