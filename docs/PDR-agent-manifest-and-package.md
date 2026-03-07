# PDR — Agent Manifest and Agent Package

## 1. Purpose
Define:
- the canonical `AgentManifest` model for agent identity, behavior, policy, and memory boundaries,
- the portable `AgentPackage` format for export/import/sharing,
- context-budget rules so agents feel distinct without token bloat.

## 2. Goals
- Agents should behave like distinct digital employees with clear authority, role, and operating style.
- Agent creation should remain lightweight for users, with advanced fields optional.
- Runtime orchestration must stay deterministic and provider-agnostic.
- Exported agents should be portable and as self-contained as possible.

## 3. Manifest Design Principles
- Keep core fields small and required.
- Separate deterministic orchestration data from prompt context data.
- Only include minimal always-on prompt fields by default.
- Advanced context fields are optional and cost-aware.
- Version all manifests for forward-compatible migration.

## 4. AgentManifest v1

### 4.0 Concrete object shape (v1)
```json
{
  "schema_version": "1.0",
  "agent_id": "agt_01JEXAMPLE",
  "name": "Dispatcher",
  "role": "Routing Coordinator",
  "primary_objective": "Route incoming requests to the best-fit agent.",
  "system_directive_short": "Be concise, deterministic, and policy-compliant.",
  "style_preset": "direct",
  "tools_policy_ref": "policy_default_dispatcher",
  "memory_profile_ref": "memory_default_dispatcher",
  "deterministic": {
    "authority_scope": "medium",
    "kpi_targets": ["routing_accuracy", "time_to_assignment"],
    "sop_refs": ["sop_router_v1"],
    "operating_constraints": {
      "max_cost_per_run_usd": 0.25,
      "max_latency_seconds": 45
    },
    "escalation_matrix_ref": "esc_default",
    "org_links": {
      "reports_to": "agt_manager",
      "reviewed_by": "agt_qa_auditor"
    }
  },
  "optional_context": {
    "enabled": false,
    "decision_authority_notes": "",
    "kpi_priority_notes": "",
    "constraint_notes": "",
    "sop_summary": "",
    "escalation_notes": "",
    "organization_context": "",
    "communication_contract": "",
    "knowledge_priority_notes": "",
    "personality_profile": "",
    "biography": "",
    "job_description_long": ""
  },
  "created_at": "2026-03-06T00:00:00.000Z",
  "updated_at": "2026-03-06T00:00:00.000Z"
}
```

### 4.1 Required fields
- `schema_version`
- `agent_id`
- `name`
- `role`
- `primary_objective`
- `system_directive_short`
- `tools_policy_ref`
- `memory_profile_ref`
- `created_at`
- `updated_at`

### 4.2 Deterministic orchestration fields (not prompt by default)
- `authority_scope`
  - autonomous decision limits
  - required approvals
- `kpi_targets`
  - measurable success metrics
- `operating_constraints`
  - budget, latency, risk, compliance constraints
- `sop_refs`
  - role-specific standard operating procedures
- `escalation_matrix`
  - delegate/review/escalate conditions and targets
- `org_links`
  - manager/reviewer/peer relationships
- `tool_permissions`
  - allowlists, scopes, rate/approval gates
- `memory_policy`
  - namespace, retention, retrieval strategy, summary policy
- `runtime_policy`
  - token budget, context assembly limits, timeout profile
- `channel_identity`
  - optional external communication identifiers (email address ref, sms number ref)
  - channel enable/disable flags per agent
  - delivery and escalation policy references

### 4.3 Always-on prompt fields (small)
- `name`
- `role`
- `primary_objective`
- `system_directive_short`

### 4.4 Optional context fields (prompt-includable, user-controlled)
High-value optional fields:
- `decision_authority_notes`
- `kpi_priority_notes`
- `constraint_notes`
- `sop_summary`
- `escalation_notes`
- `organization_context`
- `communication_contract`
- `knowledge_priority_notes`

Nice-to-have optional fields:
- `personality_profile`
- `biography`
- `job_description_long`

## 5. Context Budget Policy
- Optional context is disabled by default for new agents.
- Optional context is included only when explicitly enabled per field.
- V1 does not enforce hard max-length field limits in create/edit UI.
- If optional context exceeds budget, summarize/compress before inclusion.
- Deterministic fields remain runtime logic inputs and are not blindly appended to prompts.

## 6. Agent Creation UX (V1)

### 6.1 Core setup (required)
1. Name
2. Role
3. Primary objective
4. Tone/style preset
5. Tool access baseline
6. Knowledge source attachment

### 6.2 Advanced (optional, collapsed)
Section label: `Optional Context (Advanced)`

Disclaimer text:
`Adding optional context can improve role fidelity but increases token usage, latency, and cost.`

Fields grouped by:
- Operations (`authority`, `KPIs`, `constraints`, `SOPs`, `escalation`)
- Organization (`org context`, `communication contract`)
- Identity (`personality`, `biography`, `job description`)

### 6.3 Create/Edit modal requirements (GUI)
- Use one reusable modal for both create and edit.
- Create mode:
  - empty/default values
  - save creates new `agent_id`
- Edit mode:
  - loads existing manifest values
  - save updates same `agent_id`
- Required fields in modal:
  - `name`
  - `role`
  - `primary_objective`
  - `system_directive_short`
  - `style_preset`
- Operational fields in modal:
  - `kpi_targets` (tag/list input)
  - `sop_refs` (tag/list input)
  - `sop_summary` (multiline text)
- Advanced optional fields:
  - collapsed by default
  - disclaimer shown before fields
  - persisted in `optional_context`
- Validation:
  - required fields non-empty
  - user-facing inline errors

### 6.4 Validation checks before publish
- required fields present
- policy references valid
- no V1 hard max-length blocking
- preview of estimated context cost impact

### 6.5 Local persistence (V1 GUI scaffold)
- Persist manifests in app-managed storage (local for V1).
- Keep one list keyed by `agent_id`.
- Update `updated_at` on every edit save.
- Preserve manifest version metadata on writes.

### 6.6 TS + Rust ownership model
- TypeScript:
  - modal/form types and UX validation
  - `packages/schemas` manifest mirror type
  - local draft/edit persistence for V1 GUI
- Rust:
  - canonical runtime/storage struct for manifest persistence and orchestration use
  - serde serialization compatibility with schema versioning
- Sync rule:
  - TS and Rust manifest shapes must evolve together under `schema_version`.

## 7. AgentPackage v1 (Export/Import)

### 7.1 Package format
- extension: `.agentpkg`
- container: zip

### 7.2 Package contents
- `manifest/agent-manifest.json`
- `assets/avatar/*`
- `assets/channel-identities.json` (optional references/placeholders, no raw secrets)
- `knowledge/`
  - source metadata
  - chunks/documents
  - optional embeddings export block
- `config/`
  - tool policy snapshot
  - memory profile snapshot
  - runtime policy snapshot
- `integrity/checksums.json`
- `integrity/package-metadata.json`

### 7.3 Secret handling
- secrets are excluded by default
- secret references/placeholders included when needed
- import flow requires rebinding missing secrets
- external channel credentials (email/sms providers) are never exported as plaintext.

### 7.4 Import behavior
- validate schema version
- validate checksums
- resolve id collision (`clone`, `replace`, `merge`)
- reindex/re-embed knowledge if environment differs

## 8. Sharing Modes
- `Full Agent Package`
  - includes manifest + knowledge + assets + config snapshots
- `Template Package`
  - manifest + assets + minimal config, excludes private knowledge
- `Org Bundle` (later)
  - multiple agents + relationship graph + shared policy references

## 9. Runtime Integration Rules
- Runtime prompt builder always includes only always-on fields plus selected optional context under budget.
- Orchestration engine consumes deterministic fields for behavior/policy enforcement.
- Provider adapters receive fully assembled context package from app runtime.
- Providers must not be source-of-truth for long-term agent memory.
- Channel adapters consume `channel_identity` policy and runtime-managed inbox/outbox events.

## 10. Granular Implementation Checklist

### Phase 0 — Schema and Storage
- [ ] Define `AgentManifest v1` JSON schema.
- [ ] Define TypeScript manifest type in `packages/schemas`.
- [ ] Define Rust manifest struct in backend runtime/storage crate.
- [ ] Define storage model for required + deterministic + optional fields.
- [ ] Define `channel_identity` schema and storage refs (no plaintext secrets).
- [ ] Add schema validation tests.
- [ ] Add TS↔Rust compatibility fixture tests for manifest serialization.

### Phase 1 — Creation Flow
- [ ] Build core required-field creation form.
- [ ] Build collapsed `Optional Context (Advanced)` section.
- [ ] Add optional context cost disclaimer.
- [ ] Add publish validation with error messages.
- [ ] Build reusable create/edit modal with shared form fields.
- [ ] Support create mode and edit mode with same component.
- [ ] Persist manifest drafts and final saves in local app storage.

### Phase 2 — Context Assembly
- [ ] Implement prompt builder with always-on fields.
- [ ] Implement opt-in optional context inclusion.
- [ ] Implement optional context compression when over budget.
- [ ] Add token budget accounting and diagnostics.

### Phase 3 — Policy Integration
- [ ] Wire deterministic fields into orchestration decisions.
- [ ] Enforce authority/approval/escalation at runtime.
- [ ] Enforce channel identity and delivery/escalation policy at runtime.
- [ ] Add unit tests for policy outcomes.

### Phase 4 — Package Export
- [ ] Implement `.agentpkg` writer with manifest/assets/config/knowledge.
- [ ] Include channel identity references/placeholders in export.
- [ ] Implement checksum generation.
- [ ] Add export mode selection (`full`, `template`).

### Phase 5 — Package Import
- [ ] Implement schema/checksum validation.
- [ ] Implement id collision strategy options.
- [ ] Implement secret rebind workflow.
- [ ] Implement reindex/re-embed fallback path.

### Phase 6 — Hardening
- [ ] Add manifest migration path for future schema versions.
- [ ] Add package compatibility tests across app versions.
- [ ] Add audit trace events for export/import actions.

## 11. Acceptance Criteria
- Users can create agents quickly with required fields only.
- Optional context fields are available, collapsed by default, and clearly cost-labeled.
- Agents exhibit distinct role behavior via deterministic policy + optional context.
- Exported packages re-import with manifest, avatar, knowledge, and config intact.
- Channel identity refs/policies survive export/import without exposing secrets.
- Runtime remains provider-agnostic and app-controlled for context assembly.
