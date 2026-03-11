# PDR: Comms Agent Tooling v1

## Purpose
Define a clean, deterministic comms tool contract for agents so they can reliably find recipients and send messages across `email`, `sms`, and `chat` without brittle prompt guessing.

## Scope
- Agent-facing comms tool contract and runtime behavior.
- Directory lookup and recipient resolution behavior.
- Validation, ambiguity handling, and future fuzzy search roadmap.
- This PDR does not redefine transport adapters; it sits above existing comms transport/runtime layers.

## Goals
- One-call recipient discovery for common tasks.
- Deterministic sending (no silent best-guess delivery).
- Deterministic self-scoped reads (agent checks only its own inboxes by default).
- Compact model payloads with optional returned fields.
- Provider-agnostic design compatible with current internal/sandbox adapters and future real providers.

## Non-Goals (v1)
- Full CRM/contact enrichment.
- Global alias governance UI.
- Cross-workspace federation.

## Tool Contract Direction
- Tool id remains `comms_tool`.
- Action shape remains aligned with existing entity tools:
  - `read`
  - `create`
  - `edit`
  - `delete`
- Batched ops remain supported through `ops[]`.

## Mailbox Scope Rules (Locked)
- Agent mailbox reads are always scoped to the current active operator identity in run context.
- Agents must not provide their own account/operator IDs for reads or writes.
- Agents must not read other operators' inboxes via `comms_tool` unless an explicit delegated/admin policy is introduced later.
- Runtime enforces mailbox scoping for read and write actions the same way sender identity is enforced for sends.
- Model-facing instructions must describe reads as “check your inbox/messages” with no self-ID requirements.

## Message Read Query Direction (V1)
For message checking tasks, agent guidance should use one consistent read style under `ops[]`:
- `action: "read"`
- `target: "threads"` and/or `target: "messages"`
- `selector` supports channel/folder/search filters.

Preferred selector fields for check/reply workflows:
- `channel` (`email|sms|chat`)
- `folder` (`inbox|sent|archive|trash` where applicable)
- `search`
- `fromParticipant`
- `toParticipant`
- `subjectContains`
- `state`
- `limit`
- `offset`

Important:
- Legacy/freeform shapes like `action: "read_threads"` or `params: {...}` are invalid and should be normalized or rejected with clear errors.
- Tool detail instructions must include exact valid examples for checking inbox and reading thread messages.
- Filtering should support partial/fuzzy-friendly matching on participant and subject fields (normalization + approximate matching) to avoid false-negative “not found” outcomes from minor input variance.

### Prefetch Fast Path for Message Check (Locked)
- Ack prefetch for `intent=message_check` must perform thread discovery with structured filters in current-operator mailbox scope.
- Prefetch response should include compact candidate threads:
  - `threadId`
  - `subject`
  - `from`
  - `state`
  - `lastMessageAtMs`
- If one clear match is found (all provided filters align and candidate set is size 1):
  - prefetch must also execute `read messages` for that thread,
  - inject prefetched message payload into deep context,
  - include `recommendedThreadId` so deep can act immediately without extra search/read discovery calls.

## Fast-Ack Prefetch Integration
Shared fast-ack prefetch contract is defined in:
- `docs/PDR-fast-ack-tool-prefetch-v1.md`

Comms-specific requirement:
- For `tool=comms_tool` and `intent=message_send`, runtime must apply method-specific packetization.
- Method options:
  - `email`
  - `sms`
  - `chat`
- Only method-relevant instructions and recipient fields may be injected into deep context.

## New Read Capability
### `read operator_directory`
Single call for recipient lookup + contact return data.

#### Selector (filter) fields
- `name`
- `business_unit`
- `org_unit`
- `title`
- `channel` (`email|sms|chat`)
- `limit`

#### Optional response shaping
- `return_fields`: caller-selected fields to reduce payload bloat.
- Example return fields:
  - `name`
  - `title`
  - `business_unit`
  - `org_unit`
  - `email`
  - `phone`
  - `chat_handle`

#### Response requirements
- `matches[]` with requested fields.
- `match_confidence` per row.
- `ambiguous` boolean.
- `requires_clarification` boolean when no single high-confidence target exists.

## Send Safety Rules
- Outbound send/create message must use resolved canonical recipient address for channel.
- If lookup is ambiguous or low confidence:
  - Do not send.
  - Return structured candidate set for follow-up clarification.
- No silent fallback to guessed recipient.

## Fuzzy Match Roadmap (v1.1)
Planned enhancement for typo tolerance:
- Normalization: casing, whitespace, punctuation.
- Approximate match scoring (Levenshtein/trigram).
- Alias matching (stored aliases/handles).
- Ranked candidates with confidence thresholds:
  - High confidence single match: proceed.
  - Otherwise: clarification required.

## Example Pattern
User: "send an email to satoshi about rescheduling lunch next Tuesday."

Agent pattern:
1. `read operator_directory` with:
   - `name: "satoshi"`
   - `channel: "email"`
   - `return_fields: ["name","title","email","org_unit"]`
2. If one high-confidence match:
   - `create message` using resolved email address.
3. If multiple/low-confidence:
   - ask single clarification question with top candidates.

## Observability
- Tool output should explicitly report:
  - lookup count
  - ambiguity status
  - selected recipient(s)
  - blocked-send reason when unresolved
  - read-scope enforcement status for mailbox queries

## Implementation Notes
- Keep IDs internal for deterministic backend operations.
- Model-facing responses remain clean and human-readable.
- Do not require model to manually map org IDs to contact addresses.

## Rolling Notes
### 2026-03-10
- Locked decision: use `read operator_directory` to return resolvable contact data in one call.
- Locked decision: support `return_fields` so agent can request only needed fields.
- Locked decision: include ambiguity/confidence semantics in directory responses.
- Locked decision: keep deterministic send behavior and require clarification on unresolved targets.
- Added fuzzy-lookup roadmap for typo handling (e.g., `satshi` -> `Satoshi`).
- Moved shared fast-ack prefetch contract to `PDR-fast-ack-tool-prefetch-v1.md`.
- Retained comms-only packetization constraints in this PDR.
