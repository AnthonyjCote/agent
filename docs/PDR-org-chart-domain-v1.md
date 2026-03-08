# PDR — Org Chart Domain (V1)

## 1. Purpose
Define the Org Chart domain as the foundational hierarchy editor for Agent Deck, where users can create, organize, and maintain `org_unit` and `actor` relationships using a file-system-like interaction model.

This domain must provide:
- intuitive tree-based hierarchy editing,
- deterministic backend updates for structure changes,
- robust drag-and-drop reorganization,
- persisted undo/redo for structural edits,
- a stable foundation for assignment and workflow behavior in downstream micro-apps.

## 2. Core Decision
- Org structure is modeled with `org_unit` + `actor` + typed `link` objects.
- Hierarchy editing is performed in a tree UI that mimics familiar file system behavior.
- Drag-and-drop operations map to canonical domain commands.
- All structure mutations update links automatically via shared domain services.
- Undo/redo is persisted, command-based, and auditable.

## 2.1 Locked V1 Decisions
- V1 implementation scope is strictly: `org_unit`, `actor`, `link`, `activity_event`, `org_change_command`.
- V1 excludes: permissions matrix, external HRIS sync, and canvas-first editing.
- Drag/drop semantics are fixed:
  - actor -> org_unit: move membership (`move_actor`)
  - actor -> actor: set manager/direct-report (`set_actor_manager`)
  - org_unit -> org_unit: re-parent node (`move_org_unit`)
- Manager model is fixed:
  - each actor has at most one direct manager in V1
  - cross-org reporting is allowed in V1
  - reporting and org-unit graphs both enforce cycle prevention
- Persistence target is fixed:
  - desktop target: local app-data database in Application Support workspace path
  - server target: server-local database path under backend runtime data directory
  - both targets use the same schema + repository/service contracts
- Undo/redo scope is fixed:
  - command history is persisted per workspace
  - entries include actor identity for audit
  - undo/redo applies from the workspace history (not tied to a single browser tab lifecycle)

## 3. Domain Objects in Scope

### 3.1 `org_unit`
- Hierarchical organizational node.
- Supports deep nesting via `parent_org_unit_id`.

### 3.2 `actor`
- Human or agent participant.
- Can be placed/moved across org units.
- Supports authority hierarchy via manager/direct-report relationships.

### 3.3 `link`
- Typed relationships used to represent membership and hierarchy references.
- Must remain consistent after every move/create/delete action.
- Required link types in V1:
  - `org_unit_parent_of_org_unit`
  - `org_unit_contains_actor`
  - `actor_reports_to_actor`

### 3.4 `activity_event`
- Mutation audit record for all org-chart edits.

### 3.5 `org_change_command` (new)
- Persisted command/event for undo/redo.
- Stores operation intent + before/after snapshots (minimal diff format).

## 4. UX Model (V1)

## 4.1 Layout
- Two-pane layout:
  - Left: hierarchy tree (org units + actors)
  - Right: selected item details/actions

## 4.2 Left Pane Controls
- Icon button: `Add Org Unit`
- Icon button: `Add Actor`
- Icon button: `Edit Hierarchy` (toggle drag/drop mode)

## 4.3 Interaction Modes
- Default mode:
  - select nodes,
  - inspect/edit details,
  - no accidental drag mutations.
- Hierarchy edit mode:
  - drag/drop enabled,
  - drop targets highlighted,
  - constraints visible in UI.

## 4.4 Tree Semantics
- Tree should feel like Finder/file system:
  - expandable/collapsible folders (`org_unit`),
  - leaf/member nodes (`actor`),
  - intuitive re-parenting by drop location,
  - optional ordering inside each parent.
- In hierarchy edit mode, actors can also be dragged onto another actor to set manager/direct-report relationship.
- UI should clearly distinguish:
  - org membership (which org unit an actor belongs to),
  - authority chain (who the actor reports to).

## 5. Command Model (Deterministic)
All hierarchy mutations must route through canonical domain commands.

### 5.1 Required Commands
- `create_org_unit(parent_id, payload)`
- `create_actor(target_org_unit_id, payload)`
- `move_org_unit(node_id, new_parent_id, position)`
- `move_actor(actor_id, target_org_unit_id, position)`
- `set_actor_manager(actor_id, manager_actor_id | null)`
- `rename_org_unit(node_id, name)`
- `update_actor(actor_id, patch)`

### 5.2 Deterministic Link Updates
Each command must automatically update impacted links in the same transaction.
Examples:
- actor moved -> membership link updated
- org unit re-parented -> parent-child hierarchy relation updated
- actor manager changed -> previous `actor_reports_to_actor` link removed, new one created
- node created -> creation + relation links created

### 5.3 Validation Rules
- Prevent cycles (cannot move org unit under own descendant).
- Prevent reporting cycles (actor cannot directly/indirectly report to self).
- Prevent unsupported drop types.
- Enforce one-manager-per-actor in V1 (single direct manager, multiple direct reports).
- Cross-org reporting is allowed in V1 but must be explicit in metadata for audit/reporting.
- Enforce permission/policy constraints.
- Reject partial writes; command is all-or-nothing.

## 6. Undo/Redo (Persisted)

### 6.1 Why persisted
Org edits are high-impact and can involve many nodes. Undo/redo must survive reloads and crashes.

### 6.2 Behavior
- Each successful command appends an `org_change_command` entry.
- `undo` applies inverse command transactionally.
- `redo` reapplies command transactionally.
- Undo/redo stack is scoped by workspace with actor-attribution metadata.

### 6.3 Requirements
- Persist command history and inverse payloads.
- Keep history auditable with actor/time metadata.
- Emit activity events for undo/redo actions.

## 7. Backend Transaction Guarantees
- Every hierarchy command executes in one transaction.
- Node table updates + link updates + activity event write + command history write must commit together.
- On failure, nothing persists.

## 8. Agent/Tool Integration
- Agents should use same command services as UI.
- No direct DB writes from tools.
- Tool responses return canonical IDs and resulting parent/location metadata.

## 9. Observability and Debug
- Emit debug-friendly events for:
  - command accepted/rejected,
  - validation failures,
  - link reconciliation actions,
  - undo/redo execution.
- Include affected IDs in trace payloads.

## 10. Granular Implementation Checklist

### Phase 1 — Contracts
- [ ] Define org-chart command payload schemas.
- [ ] Define `org_change_command` persistence schema.
- [ ] Define validation error taxonomy for hierarchy mutations.
- [ ] Define `actor_reports_to_actor` link contract and manager invariants.

### Phase 2 — Domain Services
- [ ] Implement command handlers for create/move/rename/update.
- [ ] Implement `set_actor_manager` command handler.
- [ ] Implement deterministic link update routines in same transaction.
- [ ] Emit `activity_event` for every successful mutation.

### Phase 3 — Undo/Redo Core
- [ ] Persist command history with inverse payloads.
- [ ] Implement `undo_org_change` and `redo_org_change` services.
- [ ] Add safeguards for stale/conflicting history entries.

### Phase 4 — UI Tree + Controls
- [ ] Build left tree with collapse/expand and node icons.
- [ ] Add `Add Org Unit`, `Add Actor`, `Edit Hierarchy` icon actions.
- [ ] Implement drag/drop mode with clear drop affordances.
- [ ] Implement actor-on-actor drop target for manager assignment.
- [ ] Show direct-report indicator/count in tree row UI.
- [ ] Wire node selection to right-pane details editor.

### Phase 5 — Hardening
- [ ] Add cycle-prevention tests.
- [ ] Add reporting-cycle prevention tests for actor hierarchy.
- [ ] Add transaction integrity tests (command + links + activity + history).
- [ ] Add undo/redo regression tests across reload boundaries.
- [ ] Add optimistic UI + rollback behavior for failed drops.

## 11. Non-Goals (V1)
- Canvas/org-graph visualization as primary editor.
- Bulk import/export wizard.
- External HRIS sync.
- Advanced permissions matrix.

## 12. Next Step After Org Chart
- Use org-chart objects directly in Task List micro-app for:
  - org-unit scoped task views,
  - actor assignment,
  - org-unit assignment,
  - approval routing.
