# PDR — Shared Object Model and Micro-App Workflow Layers (V1)

## 1. Purpose
Define a single canonical object model for Agent Deck where each micro-app (Tasks, PM, Calendar, Ticketing, CRM, Comms, SOP/KB, Analytics) is a workflow/view layer over shared entities.

This enables:
- deterministic agent automation,
- lower context/tool-schema bloat,
- clean cross-domain linking,
- consistent human + agent collaboration,
- stronger auditability and analytics.

## 2. Core Decision
- We will not build isolated micro-app schemas.
- We will build one shared object model with typed links and a universal activity stream.
- All UI actions and agent tool actions must mutate the same canonical objects via shared domain services.
- V1 organizational hierarchy will be modeled **only** with nested `org_unit` (no separate `actor_group` object).

## 3. Canonical Entities (V1 Foundation)

### 3.1 `work_item`
Universal unit of work.
- Examples: task, subtask, bug, feature, follow-up, reminder, approval.
- Core fields: `id`, `type`, `title`, `status`, `priority`, `owner_id`, `assignee_id`, `org_unit_id`, `due_at`, `scheduled_for`, `project_id`, `parent_id`.

### 3.2 `project`
Container for structured work.
- Core fields: `id`, `name`, `type`, `status`, `owner_id`, `stage`.

### 3.3 `calendar_event`
Time object (not work state object).
- Core fields: `id`, `title`, `event_kind`, `start_at`, `end_at`, `timezone`, `participants`, `linked_entity_ids`.

### 3.4 `ticket`
Request/intake object.
- Core fields: `id`, `title`, `status`, `severity`, `channel`, `requester_id`, `company_id`, `sla_due_at`.

### 3.5 `message_thread` and `message`
Communication objects.
- Thread fields: `id`, `channel`, `participants`, `last_message_at`, links.
- Message fields: `id`, `thread_id`, `direction`, `from`, `to`, `body_text`, `attachments`, `sent_at`.

### 3.6 `contact` and `company`
CRM-lite entities.
- Contact fields: `id`, `name`, `email`, `phone`, `role`, `company_id`, `tags`, `status`.
- Company fields: `id`, `name`, `industry`, `status`, `owner_id`, `tags`.

### 3.7 `doc`
Shared document object.
- Examples: SOP, wiki page, KB article, policy, playbook.
- Core fields: `id`, `doc_kind`, `title`, `body`, `format`, `status`, `version`, `owner_id`, `tags`.

### 3.8 `link`
Universal typed relationship.
- Core fields: `id`, `from_type`, `from_id`, `to_type`, `to_id`, `relation`, `created_at`.

### 3.9 `activity_event`
Universal mutation/audit stream.
- Core fields: `id`, `entity_type`, `entity_id`, `event_type`, `actor_id`, `timestamp`, `data`.

### 3.10 `metric_record` / dashboard objects (later V1.5)
Analytics projection entities read from canonical objects and activity events.

### 3.11 `org_unit`
Department/team hierarchy entity.
- Core fields: `id`, `name`, `kind` (`department|team|squad|unit`), `parent_org_unit_id`, `owner_actor_id`, `status`.
- `org_unit` is the only organizational hierarchy object in V1 and supports deep nesting.

### 3.12 `operator`
Unified participant model for humans and agents.
- Core fields: `id`, `kind` (`human|agent`), `name`, `status`, `primary_contact_id`.
- Operators belong to one or more `org_unit` nodes via typed `link` records.

### 3.13 `actor_channel`
External communication routing for operators.
- Core fields: `id`, `actor_id`, `channel_type` (`email|sms|mms|other`), `address`, `is_primary`, `status`.

## 4. Architecture Boundaries

### 4.1 Shared Domain Layer (source of truth)
- Owns object schemas, validation, transitions, and write rules.
- Exposes services for create/update/link/transition actions.
- Emits `activity_event` on all meaningful mutations.
- Owns assignment/approval rules for mixed human+agent operators and org units.

### 4.2 Micro-App Layers (workflow/view)
- Each micro-app is query/projection + UX + allowed actions.
- No micro-app-specific source-of-truth schema.
- No direct persistence writes outside shared domain services.

### 4.3 Agent Tool Layer
- Agent tools call shared domain services, not UI-specific code.
- Tool schemas operate on canonical entities.
- Tool outputs reference canonical IDs for deterministic chaining.

### 4.4 UI Layer
- UI reads projections and invokes domain actions.
- Human edits and agent actions remain fully interoperable.

## 5. Design Rules (Required)
1. One canonical internal model.
2. Separate object truth from page/view projection.
3. Time objects (`calendar_event`) are distinct from work objects (`work_item`).
4. Relationships must be typed via `link`.
5. Every meaningful mutation emits `activity_event`.
6. Micro-apps are workflow layers, not isolated databases.
7. Assignment targets must support both individual operators and org units.
8. Human-in-the-loop is first-class: approvals, assignments, scheduling, and comms must work for human operators.

## 6. V1 Sequencing

### 6.1 First micro-app to ship
- **Task List / To-Do List** domain page.
- Powered by canonical `work_item` + `project` + `org_unit` + `operator` + `link` + `activity_event`.
- Task list must support:
  - department/team-scoped views via `org_unit`,
  - personal queues per operator,
  - hierarchy via `parent_id` (task/subtask),
  - org-unit assignment for coordinated execution.

### 6.2 First agent tool set
- `work_item.create`
- `work_item.update_status`
- `work_item.assign`
- `work_item.assign_org_unit`
- `work_item.list`
- `project.list` (read-only in first pass)
- `org_unit.list`
- `operator.list`
- `link.create` (minimal relation set in first pass)

### 6.3 UI-human parity goals
- Anything agents can do to `work_item` via tools should be possible in UI.
- Anything humans do in UI should be visible to agent tools via shared object state.

## 7. Data and Persistence Strategy (V1)
- Persist canonical objects in shared backend storage.
- Persist `activity_event` append-only log for audit/debug/analytics.
- Add projection queries for Task List page:
  - status, assignee, org-unit assignment, due date, priority,
  - org unit and team hierarchy filters,
  - task/subtask expansion.

## 8. Agent Runtime Integration (V1)
- Toolbox only exposes tools enabled by policy.
- Tool calls return canonical IDs and structured result payloads.
- Runtime traces include:
  - proposed/dispatched/completed tool lifecycle,
  - mutation summary,
  - affected entity IDs.
- Runtime/tool contract must allow targeting:
  - individual operator assignment,
  - org-unit assignment,
  - approval requests for human operators.

## 9. Granular Implementation Checklist

### Phase 1 — Contracts
- [ ] Define Rust model structs for `work_item`, `project`, `org_unit`, `operator`, `actor_channel`, `link`, `activity_event`.
- [ ] Define schema validation and status transition rules for `work_item`.
- [ ] Define typed relation enum for `link.relation` (minimal V1 set).
- [ ] Define assignment target contract (`assignee_id` and/or `org_unit_id`) and org-unit scoping rules.

### Phase 2 — Domain Services
- [ ] Build shared services:
  - `create_work_item`
  - `update_work_item`
  - `update_work_item_status`
  - `assign_work_item`
  - `assign_work_item_org_unit`
  - `list_work_items`
  - `list_org_units`
  - `list_actors`
  - `create_link`
- [ ] Emit `activity_event` for all service mutations.

### Phase 3 — Tooling
- [ ] Add agent tools for work-item operations over shared services.
- [ ] Return deterministic structured payloads with canonical IDs.
- [ ] Add tool tests for validation errors and transition rules.
- [ ] Add agent tools for mixed assignment and approval targeting (`operator`/`org_unit`).

### Phase 4 — Task List Micro-App
- [ ] Create domain page for Task List (`domains/task-list`).
- [ ] Add list/filter/sort projection queries.
- [ ] Add left hierarchy rail for `org_unit` (department/team tree).
- [ ] Add segment/grouped task view (for example intake/active/review/blocked).
- [ ] Add create/edit/status/assign UI actions (human or agent or org unit).
- [ ] Add nested task/subtask expansion and quick actions.
- [ ] Ensure UI actions call shared domain services.

### Phase 5 — Collaboration and Traceability
- [ ] Show recent activity timeline per work item.
- [ ] Surface agent-created vs human-created changes in activity feed.
- [ ] Add run debug links to affected entity IDs where applicable.
- [ ] Show assignment target context (operator/org-unit/human/agent) in activity timeline.

### Phase 6 — Hardening
- [ ] Add concurrency-safe update strategy for work-item edits.
- [ ] Add idempotency key support for agent tool mutations.
- [ ] Add regression tests for cross-surface consistency (UI and tools).
- [ ] Add permission hooks for org-unit scoped visibility and assignment policy.

## 10. Non-Goals (V1)
- Full CRM/Ticketing/Calendar write surfaces.
- Global analytics dashboards.
- Full SOP + KB RAG lifecycle.
- External vendor sync adapters.

## 11. Immediate Next Build
After this PDR:
1. Implement canonical work-item domain services.
2. Ship Task List micro-app page + shared UI list/edit components.
3. Wire first work-item tool set for agent collaboration.
