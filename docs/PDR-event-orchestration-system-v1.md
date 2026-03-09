# PDR Event Orchestration System V1

## Purpose
Create a domain-agnostic orchestration layer that executes background agent work safely under rate/concurrency limits, without introducing a second agent runtime path.

The system must:
- accept domain-generated work units
- schedule them with backlog control and fairness
- dispatch them through the same runtime path used by Chat GUI
- provide retries, analytics, and debug visibility

## Core Decision (Settled)
Background automation is **GUI-style prompting from non-human triggers**.

Manual path today:
- User message in Chat GUI -> Agent run -> Tool use -> Final response

Event-driven path tomorrow:
- Domain trigger -> Structured work unit (prompt package) -> Orchestrator queue -> Agent run (same runtime) -> Domain applies result

No separate agent execution stack.

## Separation of Responsibilities

### Domain Responsibilities (Comms, Tickets, etc.)
Domains own business semantics and trigger logic.

Domain duties:
- detect trigger events
- build structured work units for agents
- attach domain-scoped context and instructions
- define expected outcome contract
- apply run outputs back into domain state (send reply, close ticket, escalate, route, etc.)

### Orchestrator Responsibilities (This PDR)
Orchestrator is execution governance only.

Orchestrator duties:
- durable intake of work units
- dedupe and queue placement
- prioritization and backlog control
- concurrency/rate-limit enforcement
- dispatch to runtime
- retry/dead-letter handling
- metrics/analytics/debug/audit

### Runtime Responsibilities (Existing)
Runtime remains unchanged in behavior.

Runtime duties:
- execute agent turn
- call tools
- stream progress
- return final output and tool outcomes

## Scope (V1)
- work-unit intake and persistence
- 4-lane queue controller (Eisenhower-based)
- dynamic score aging + anti-starvation
- adaptive lane traffic ratio controller
- 80/20 throughput reserve policy
- retry/dead-letter pipeline
- dispatcher to existing run API/runtime
- observability contracts for queue analytics and debugging

## Out of Scope (V1)
- SOP authoring UI
- external provider adapters (real email/SMS provider wiring)
- predictive/ML route optimization

## Domain -> Orchestrator Interface (V1)
Domain submits normalized `work_unit` records.

Contract source of truth:
- `docs/PDR-work-unit-contract-v1.md`

Event orchestrator consumes the locked contract as-is and must not fork its shape by execution mode.

## Orchestrator -> Runtime Interface (V1)
Dispatcher converts queued work item into standard run request and submits through existing runtime run API.

Important constraint:
- The runtime call path must be the same path used for manual Chat GUI runs.

## Runtime Result -> Domain Interface (V1)
After run completion/failure, orchestrator emits a `work_result` for the originating domain.

Domain consumes result and applies effects:
- `comms`: send or draft reply, update thread status
- `tickets`: close/escalate/route/update enrichment

This preserves domain ownership of business state transitions.

## Queue Architecture

## Lane Taxonomy
Queues:
- `short_high`
- `short_normal`
- `long_high`
- `long_normal`

Routing dimensions:
- `urgency_score` (1-10)
- `importance_score` (1-10)

Suggested thresholds:
- `short` if urgency >= 7
- `high` if importance >= 7

## Queue Controller (Backlog Traffic System)
The 4 lanes are a backlog controller, not a simple categorization UI.

### Goals
- high lanes act as fast lanes under pressure
- normal lanes never starve
- system remains stable under sustained backlog

### Service Ratio
Use adaptive high-vs-normal dispatch ratios.

Example baseline:
- `high:normal = 4:1`

Dynamic adjustment (illustrative):
- high under stress -> `6:1`
- normal starvation risk -> `3:2`
- severe starvation -> `1:1` until recovery

Guarantee:
- normal lanes always maintain non-zero throughput.

## Fairness and Anti-Starvation
Use a separate in-lane sort metric:
- `lane_sort_score` (continuous float)

Lane assignment remains urgency/importance based.
`lane_sort_score` controls order within a lane.

Proposed formula:
- `lane_sort_score = base_sort + aging_boost + starvation_boost`

Where:
- `base_sort`: derived from effective urgency/importance
- `aging_boost`: increases with wait time
- `starvation_boost`: ramps faster after threshold wait

Hard safeguards:
- `max_wait_sla_per_lane`
- when exceeded: forced dispatch window or bounded auto-promotion
- all safeguard actions audit-logged

## Sequence and Dependency Safety
- strict FIFO per `sequence_key`
- honor `depends_on` prerequisites
- no dependent dispatch before prerequisites complete
- retries preserve correlation/causation chain

## Rate Limits, Concurrency, and Reserve
Configurable limits by scope:
- global
- business unit
- org unit
- operator
- provider/model/tool class

80/20 policy:
- normal operation consumes up to 80% of budget
- 20% reserved for urgent/manual-immediate/SLA-protection work

Backpressure behavior:
- queue (no drop)
- dispatch when quota available
- explicit throttle reason telemetry

## Failure, Retry, Dead-Letter
- exponential backoff + jitter
- per-action-type max attempts
- dead-letter on terminal failure
- explicit replay path

## Trigger Sources (V1)
Initial trigger sources expected to feed domain work units:
- `comms.message_received`
- `tickets.ticket_received`
- `tickets.ticket_escalated`
- `schedule.time_reached`
- `manual.triggered`

## UI Architecture (Dashboard-First)
The event page is an operations dashboard and debugger, not a pure kanban page.

### Layout
1. KPI strip
   - queue depth, dispatch throughput, completion rate, failures, retries, dead-letter, oldest age, reserve usage
2. Masonry analytics area
   - throughput trends
   - lane saturation
   - age distribution
   - team/operator hotspot diagnostics
   - throttle/limit diagnostics
3. Full-width lane rail section
   - compact cards per lane + counts + oldest age + SLA risk

### Drill-down
- lane modal for deep queue operations
- item modal for full payload, trace, dependency graph, retry history, manual actions
- analytics drill-down modal for team/operator/domain bottlenecks

## Observability and Audit
Must persist full lifecycle transitions:
- accepted
- deduped
- scored
- queued
- dispatched
- running
- completed
- failed
- retried
- dead-lettered

All records include correlation and causation IDs.

## Minimal Data Model (V1)
- `work_units`
- `queue_entries`
- `dispatch_attempts`
- `run_links` (queue item -> runtime run id)
- `retry_records`
- `dead_letter_entries`
- `rate_limit_metrics`
- `audit_events`

## Acceptance Criteria
- event-driven runs use same runtime path as Chat GUI runs
- orchestrator does not own domain business logic
- high lanes remain fast while normal lanes maintain progress
- anti-starvation prevents indefinite tail stall under persistent backlog
- rate limits and 80/20 reserve are enforced and visible
- failed background work can be retried/replayed deterministically
- queue analytics clearly identify bottlenecks by domain/team/operator

## Implementation Phases
1. finalize `work_unit` contract and ingestion
2. queue persistence + lane routing + scoring
3. adaptive dispatcher with fairness and reserve policy
4. runtime dispatch bridge (shared run path)
5. retry/dead-letter + replay controls
6. dashboard analytics + debug UX
