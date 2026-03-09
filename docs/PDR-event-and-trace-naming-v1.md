# PDR Event and Trace Naming V1

## Purpose
Standardize naming and identifier conventions across domains for events, actions, traces, and dedupe keys so logging, analytics, and debugging remain coherent as domains scale.

## Naming Conventions

### Event Types
Format:
- `<domain>.<entity_or_stream>_<verb>`

Examples:
- `comms.message_received`
- `tickets.ticket_received`
- `tickets.ticket_escalated`
- `schedule.time_reached`
- `system.manual_triggered`

Rules:
- lowercase
- snake_case for segment words
- dot-separated namespace prefixes
- stable over time; avoid ad-hoc renames

### Action Types (`work_unit.action_type`)
Format:
- `<verb>_<object>[_qualifier]`

Examples:
- `reply_to_message`
- `triage_ticket`
- `analyze_and_route_ticket`
- `enrich_ticket_context`

Rules:
- lowercase snake_case
- domain semantic, not tool semantic
- no provider names in action type

## Identifier Fields

### Correlation and Causation
- `correlation_id`: shared across related workflow chain
- `causation_id`: immediate parent trigger/work unit/event

Rules:
- always present in `work_unit.trace`
- immutable once assigned
- downstream events inherit correlation and set causation to parent operation id

### Dedupe Key
Field:
- `work_unit.idempotency.dedupe_key`

Rules:
- deterministic from domain trigger identity
- stable for duplicate trigger replays
- unique enough to prevent accidental collapse of distinct work

Suggested composition:
- `<domain>:<trigger_ref>:<target_operator>:<time_bucket_or_source_id>`

## Display Name vs Internal IDs
Model/domain-facing conventions:
- prefer name refs (`business_unit_name_ref`, `org_unit_name_ref`, `target_operator`)

Backend conventions:
- resolve to internal IDs for deterministic writes/execution
- internal IDs remain in backend/debug storage, not required in model-facing contracts

## Log and Metric Label Hygiene
- Use canonical `event_type` and `action_type` as primary dimensions.
- Avoid free-form labels as metric keys.
- Keep label cardinality bounded (especially operator/team tags).

## Versioning and Deprecation
- breaking naming changes require explicit migration note in PDRs
- deprecated event/action names kept as aliases during transition window
- analytics mappings updated before alias removal

## Acceptance Criteria
- all new triggers use canonical `event_type` format
- all `work_unit` entries use canonical `action_type` format
- correlation/causation/dedupe fields are present and valid
- dashboards/debug tooling can aggregate across domains without custom per-domain parsers
