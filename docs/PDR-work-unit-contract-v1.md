# PDR Work Unit Contract V1

## Purpose
Lock a minimal, robust `work_unit` object contract that all domains use to trigger automated background work through a shared dispatch adapter.

This contract is designed to support:
- rapid domain iteration in direct execution mode
- later orchestration/queue routing without schema rewrites
- both `agent_run` and `automation_run` execution modes

## Core Decision
Use `work_unit` as the canonical object name (not work intent).

All domains emit `work_unit` objects through one shared interface:
- `dispatchWorkUnit(workUnit, options)`

Backends behind the interface:
- `direct` (dev/test velocity)
- `orchestrated` (queue-governed production mode)

The `work_unit` schema stays identical across both modes.

## Required V1 Schema
- `id`
- `domain` (`comms|tickets|tasks|schedule|crm|system`)
- `action_type`
- `target_operator`
- `scope`
  - `business_unit_name_ref`
  - `org_unit_name_ref`
- `input`
- `tool_scope`
- `priority`
  - `urgency_score` (1-10)
  - `importance_score` (1-10)
  - `deadline_at` (optional)
- `execution`
  - `mode` (`agent_run|automation_run`)
  - `max_attempts`
  - `timeout_ms`
- `ordering`
  - `sequence_key` (optional)
  - `depends_on` (optional array)
- `idempotency`
  - `dedupe_key`
- `trace`
  - `correlation_id`
  - `causation_id`
  - `source_event_type`
  - `source_event_id`
- `status`
  - `queued|running|completed|failed|dead_lettered`
- `result_ref`

## Field Notes
- `action_type`: domain semantic verb (for example `reply_to_message`, `triage_ticket`).
- `target_operator`: model-facing uses name-ref style; backend resolves internal IDs.
- `input`: compact, structured execution payload for the action.
- `tool_scope`: explicit allowed tools/groups for this unit.
- `dedupe_key`: required in both direct and orchestrated modes.
- `trace`: always required to preserve causal observability.

## Design Constraints
- Keep schema minimal; do not add domain-specific bloat to core object.
- Domain-specific extras belong in `input` or domain tables, not top-level core fields.
- Status lifecycle must be deterministic and auditable.
- No mode-specific schema forks.

## Dispatch Interface Contract
- `dispatchWorkUnit(workUnit, options)` is mandatory entrypoint.
- Domains must not call runtime run APIs directly for automated triggers.
- Adapter backend can be switched by environment/config without changing domain code.

## Result Envelope (V1)
Dispatch/runner returns a normalized result envelope:
- `work_unit_id`
- `status` (`completed|failed|dead_lettered|queued|running`)
- `run_id` (if runtime execution occurred)
- `error` (structured, optional)
- `result_ref` (optional)
- `trace` (`correlation_id`, `causation_id`)

## Acceptance Criteria
- All domain automation triggers can emit valid `work_unit` objects.
- Both `direct` and `orchestrated` backends accept the same object contract.
- No schema rewrite required when switching from direct to orchestrated mode.
- Idempotency and trace metadata are present in all emitted work units.
