# PDR Dispatch Adapter Spec V1

## Purpose
Freeze a single dispatch interface for automated domain work so domain teams can move quickly now (`direct` backend) and migrate cleanly later (`orchestrated` backend) without code churn.

## Canonical Interface
`dispatchWorkUnit(workUnit, options)`

### Inputs
- `workUnit`: must conform to `docs/PDR-work-unit-contract-v1.md`
- `options` (optional):
  - `execution_mode_override`: `direct|orchestrated` (for test/dev)
  - `dry_run`: boolean (optional)
  - `requested_by`: actor metadata (optional)

## Backend Modes
- `direct`:
  - immediate execution via existing runtime path
  - no queue gating
  - still emits parity telemetry/audit records
- `orchestrated`:
  - enqueue -> schedule -> dispatch via queue controller
  - full lane/rate/retry governance

## Behavioral Parity Requirements
Regardless of backend mode:
- same `work_unit` schema
- same result envelope shape
- same error code family
- same trace fields
- same idempotency behavior contract

## Result Envelope
`DispatchResult` fields:
- `work_unit_id`
- `status` (`queued|running|completed|failed|dead_lettered`)
- `run_id` (optional)
- `result_ref` (optional)
- `error` (optional structured object)
  - `code`
  - `message`
  - `retryable`
- `trace`
  - `correlation_id`
  - `causation_id`

## Error Code Contract (Core)
Required adapter-level error families:
- `dispatch_validation_failed`
- `dispatch_permission_denied`
- `dispatch_deduped`
- `dispatch_rate_limited`
- `dispatch_queue_unavailable`
- `dispatch_runtime_failed`
- `dispatch_internal_error`

Rules:
- codes are stable, machine-parseable, lower_snake_case
- do not leak backend-specific internals into domain-facing error contracts

## Idempotency and Dedupe
- `workUnit.idempotency.dedupe_key` required
- adapter must enforce dedupe contract in both modes
- dedupe outcomes return structured `dispatch_deduped` result

## Telemetry Contract
Adapter emits normalized telemetry in both modes:
- accepted
- rejected
- deduped
- queued (or synthetic queued in direct mode)
- dispatched
- completed
- failed

## Non-Goals
- adapter does not own domain business logic
- adapter does not modify domain payload semantics
- adapter does not introduce mode-specific schema forks

## Acceptance Criteria
- domains integrate only through this adapter
- switching backend mode requires config change only
- no domain code rewrite to move from direct to orchestrated execution
