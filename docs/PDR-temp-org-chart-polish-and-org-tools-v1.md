# PDR (Temp) — Org Chart Domain Polish + Org Creation Tools (V1)

## Purpose
Close the Org Chart domain as "done for now" by adding:
1. a premium default read-only details dashboard on the right pane,
2. explicit edit mode entry with permission-gating seams,
3. first agent tool surface for creating org objects (`business_unit`, `org_unit`, `operator`) through the same command path as UI.

This is a polish/integration PDR on top of existing org-chart and persistence work.

## Decisions (Locked)
1. Right pane default is read-only information view.
2. Editing is entered via explicit icon action (`Edit`), not inline default form.
3. Save/cancel lifecycle is mode-based:
   - `view` mode: read-only cards
   - `edit` mode: field editors
4. Permission is evaluated before entering edit mode and before command execution.
5. Agent tool writes must use the same org command service (no direct DB writes).
6. "Rename/archive conversation threads" remain out of scope for this org-chart slice (V2).

## Scope
In scope:
1. Right-pane read-only cards for selected node types:
   - Business Unit
   - Org Unit
   - Operator
2. Edit icon actions and permission seam.
3. Edit-mode forms reusing existing shared controls/components.
4. Tool: `org_manage_entities_v1` with create actions.
5. Audit events for UI edits and tool edits.

Out of scope:
1. Full RBAC implementation.
2. Employee self-service read-only portal.
3. Advanced per-field permissions.
4. Bulk import/export.

## UX Model
### Visual Direction (Explicit)
Read-only mode must be designed like a premium, high-end website experience, not a basic internal employee profile/tool screen.

Design requirements:
1. Webpage-like visual composition with strong typography hierarchy and intentional whitespace.
2. Premium card/surface treatments with restrained, elegant contrast and polished spacing rhythm.
3. Layout should feel editorial/product-grade, not form-first.
4. Interaction affordances (edit actions, hover states, section transitions) should be subtle and refined.
5. The right-pane read-only view should present each node as an "organizational asset dashboard" quality surface.

### Right Pane Modes
1. `view` (default):
   - Premium card layout.
   - Structured summary sections with consistent spacing/typography.
   - Top-right compact icon action: `Edit`.
2. `edit`:
   - Existing field controls.
   - Explicit save/cancel.
   - Exit to `view` after successful save.

### Read-Only Card Sections (V1)
1. Header:
   - Avatar/logo/icon
   - Name
   - Role/type subtitle
2. Core Info:
   - Short description
   - Parent and sub-unit counts (for BU/org unit)
   - Org assignment / reports-to / type (for operator)
3. Linked Summary Placeholders (read-only stubs, no deep behavior yet):
   - Associated docs
   - Tasks
   - Calendar
   - Comms (email/phone/social)

## Permission Gate Contract (Seam for V1)
### Frontend gate
`canEditOrgNode(context, node): boolean`

Default V1 behavior:
1. Return `true` for owner/admin sessions.
2. Return `false` for read-only sessions.

### Backend gate
All mutating commands validate `actor_permissions` context before execution.

Default V1 behavior:
1. Mutations allowed for local owner/admin context.
2. Structured permission errors returned for denied attempts.

## Agent Tool (V1)
### Tool ID
`org_manage_entities_v1`

### Allowed actions
1. `create_business_unit`
2. `create_org_unit`
3. `create_operator`

### Execution rules
1. Tool handler maps action -> existing org command(s).
2. Same validation and transaction path as UI.
3. Return canonical IDs and placement metadata.
4. Emit activity events with actor=`agent:<id>`.

### V1 non-goals for tool
1. No delete/move bulk operations in first release.
2. No cross-workspace effects.
3. No direct permission bypass.

## Data/Contracts
No new storage engine decisions in this PDR.
Use existing persisted org/state runtime path already implemented.

Required output DTO additions for right-pane view cards:
1. Node summary DTOs with computed counts:
   - child org units
   - direct reports
   - assigned operators
2. Linked summary placeholders:
   - counts/availability flags only in V1.

## Implementation Checklist
### Phase 1 — Right Pane Mode Architecture
- [ ] Add right-pane mode state (`view` | `edit`) per selected node.
- [ ] Add edit icon button in right-pane top rail.
- [ ] Add save/cancel handling to return to `view` mode deterministically.
- [ ] Ensure node selection changes reset mode to `view`.

### Phase 2 — Read-Only View Cards
- [ ] Build Business Unit read-only card layout.
- [ ] Build Org Unit read-only card layout.
- [ ] Build Operator read-only card layout.
- [ ] Add shared read-only field row primitive if needed.
- [ ] Add linked-summary placeholder cards (docs/tasks/calendar/comms).

### Phase 3 — Permission Seams
- [ ] Add `canEditOrgNode(...)` frontend gate.
- [ ] Hide/disable edit controls when denied.
- [ ] Add backend permission check seam for all org mutations.
- [ ] Return structured permission errors (code + message).

### Phase 4 — Tooling
- [ ] Add tool contract `org_manage_entities_v1` in runtime tooling layer.
- [ ] Implement action routing to org command service.
- [ ] Add audit event emission for tool-created entities.
- [ ] Add deterministic response schema for created object metadata.

### Phase 5 — Quality + Completion
- [ ] Add regression tests: view/edit mode transitions and no accidental edit writes.
- [ ] Add permission-denied UI test coverage for edit button visibility/disabled behavior.
- [ ] Add tool integration tests for create actions and validation failures.
- [ ] Verify persistence across reload/restart for all create/edit paths.

## Done-for-Now Exit Criteria
1. Right pane opens in read-only mode for all node types.
2. Edit mode only entered intentionally through icon action.
3. Permission seam is in place (frontend + backend checks).
4. Agent tool can create BU/org unit/operator via same command path as UI.
5. Reload/restart preserves all org edits and tool-created entities.

## Notes
This PDR intentionally prepares the org-chart domain to become a permission-gated org inventory/directory later, without forcing full RBAC or employee portal scope into V1.
