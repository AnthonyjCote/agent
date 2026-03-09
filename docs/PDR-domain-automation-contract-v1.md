# PDR Domain Automation Contract V1

## Purpose
Define the minimum contract each domain must implement for automation triggers so all domains remain consistent and compatible with the shared `work_unit` + dispatch architecture.

This is a velocity guardrail doc: small, strict, reusable.

## Scope
Applies to all domains that trigger automated work:
- comms
- tickets
- tasks
- schedule
- crm
- future domains

## Required Domain Sections
Every domain PDR/spec must include these sections.

### 1. Trigger Definitions
For each trigger, specify:
- `trigger_name`
- `event_type`
- source object(s)
- trigger condition
- dedupe behavior
- idempotency notes

Example:
- `trigger_name`: inbound_message_reply_needed
- `event_type`: comms.message_received
- condition: message direction=inbound and assigned operator exists

### 2. Work Unit Builder Mapping
For each trigger, map domain data -> `work_unit`:
- `domain`
- `action_type`
- `target_operator`
- `scope` (BU/OU refs)
- `input` payload mapping
- `tool_scope`
- `priority` (`urgency_score`, `importance_score`, optional `deadline_at`)
- `ordering` (`sequence_key`, `depends_on` as needed)
- `idempotency.dedupe_key`
- `trace` fields (`correlation_id`, `causation_id`, `source_event_type`, `source_event_id`)

Constraint:
- `work_unit` shape must match `docs/PDR-work-unit-contract-v1.md` exactly.

### 3. Result Application Mapping
Define how domain consumes dispatch/run outcomes:
- success path effects
- partial/continuation path effects
- failure path effects
- terminal/dead-letter behavior

Example for comms:
- success -> append outbound message, mark thread state
- failure -> mark pending/manual-review, optionally generate follow-up work unit

### 4. Failure and Retry Policy
Domain-specific policy table must define:
- retryable errors
- non-retryable errors
- max attempts defaults
- timeout defaults
- dead-letter escalation behavior

### 5. Tool Scope Policy
For each action type, list allowed tools/tool-groups.
No open-ended tool access.

## Domain Contract Rules
- Domains own business semantics.
- Domains do not bypass `dispatchWorkUnit`.
- Domains do not define their own queue semantics.
- Domains do not mutate the core `work_unit` schema.
- Domain-specific extras stay in `work_unit.input` or domain-local storage.

## Required Test Cases Per Domain Trigger
- duplicate trigger produces no duplicate side-effect
- valid trigger creates valid `work_unit`
- failed run returns structured result and domain applies correct fallback
- retries honor dedupe/trace fields
- direct and orchestrated modes produce parity in domain outcomes

## Acceptance Criteria
A domain is automation-ready when:
- all triggers have explicit builder mappings
- all action types have result application logic
- failure/retry policy table is defined
- tool scopes are explicit
- dispatch path uses shared adapter only
