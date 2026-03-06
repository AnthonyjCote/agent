# PDR — Starter Agent Templates (V1)

## 1. Purpose
Define the initial built-in utility agent templates shipped with Agent Deck:
- `Agent Architect`
- `Dispatcher`
- `QA Auditor`

These templates accelerate onboarding and establish core orchestration patterns without hardcoding privileged behavior.

## 2. Goals
- Provide immediate utility out of the box.
- Keep templates generic and domain-agnostic.
- Ensure all starter agents use the same policy/tool/memory model as user-created agents.
- Keep templates fully editable, clonable, and removable.

## 3. Non-Goals
- Shipping full department-specific company role packs in V1.
- Creating non-editable “system agents” with hidden privileges.
- Embedding provider-specific assumptions into templates.

## 4. Starter Templates

### 4.1 Agent Architect
Purpose:
- Assist users in creating and refining new agent manifests.

Primary responsibilities:
- Draft role/objective/directive from user intent.
- Recommend tool permissions and approval gates.
- Propose memory profile and knowledge-source strategy.
- Validate manifest completeness and policy consistency before publish.

Output contract:
- manifest-ready draft payload
- validation report (missing fields, risk flags, recommendations)

### 4.2 Dispatcher
Purpose:
- Serve as the default general interface and routing coordinator.

Primary responsibilities:
- Classify incoming requests.
- Route/delegate to best-fit specialist agents.
- Handle fallback when no specialist exists.
- Track task state and summarize handoffs.

Output contract:
- routing decision with rationale
- execution handoff payload
- status summary for user visibility

### 4.3 QA Auditor
Purpose:
- Validate quality, completeness, and risk posture of agent outputs.

Primary responsibilities:
- Evaluate completion claims against acceptance criteria.
- Check evidence/artifact sufficiency.
- Flag policy or safety concerns.
- Approve, reject, or request revision with structured findings.

Output contract:
- verdict (`approve`, `revise`, `reject`)
- criteria coverage report
- risk findings and required fixes

## 5. Shared Template Constraints
- Templates are stored as standard `AgentManifest` assets.
- Templates are editable by users post-install.
- Templates are not trusted beyond normal policy controls.
- Tool access defaults are conservative and auditable.
- Template behavior is provider-agnostic.

## 6. Default Policy Profiles (V1)

### Agent Architect
- Tooling:
  - read-only access to schema docs/agent configs
  - no destructive external actions by default
- Risk tier:
  - low/medium only

### Dispatcher
- Tooling:
  - orchestration/delegation actions
  - read task/run metadata
  - limited direct external side effects
- Risk tier:
  - low/medium with strict budget profiles

### QA Auditor
- Tooling:
  - read-only access to runs/artifacts/traces
  - no external write actions by default
- Risk tier:
  - low only by default

## 7. UX Requirements
- On first launch, offer one-click install of starter templates.
- Show a short explanation for each template’s purpose.
- Allow:
  - `Use as is`
  - `Clone and customize`
  - `Skip`
- In agent list, mark them as `Starter Template` (informational label only).

## 8. Runtime Integration Rules
- Dispatcher can delegate to starter and user-created agents.
- QA Auditor can review any run with available trace/artifacts.
- Agent Architect can generate manifest drafts but cannot bypass publish validation.
- All three follow the same approval and budget policies as other agents.
- QA Auditor invocation is governed by runtime review policy:
  - `none`
  - `conditional` (default)
  - `always`
- For `conditional`, QA Auditor runs when any flag is true:
  - high-risk tool used
  - budget extension requested
  - missing/incomplete completion evidence
  - low completion confidence
- QA review depth is `lite` first, then `full` only when lite review fails or is uncertain.
- No hard QA Auditor call caps are used for throughput control.

## 9. Granular Implementation Checklist

### Phase 0 — Template Specs
- [ ] Define starter template manifests for all three agents.
- [ ] Define directives, default policies, and memory profiles.
- [ ] Define output schemas/contracts for each template.

### Phase 1 — Packaging and Install
- [ ] Add starter templates to bootstrap assets.
- [ ] Implement first-run template install flow (`use`, `clone`, `skip`).
- [ ] Add metadata label for starter-template origin.

### Phase 2 — Behavior Wiring
- [ ] Wire Dispatcher routing output to orchestration handoff.
- [ ] Wire Agent Architect manifest draft output to creation workflow.
- [ ] Wire QA Auditor verdict output to completion/review pipeline.
- [ ] Wire QA Auditor invocation to runtime review policy modes and conditional flags.
- [ ] Wire QA Auditor lite-first/full-on-fail review depth behavior.

### Phase 3 — Safety and Policy
- [ ] Apply conservative default tool permissions.
- [ ] Ensure no template has hidden privileged actions.
- [ ] Add policy tests for blocked high-risk actions by default.

### Phase 4 — Validation and QA
- [ ] Add scenario tests for each template’s core function.
- [ ] Add regression tests for editable/cloneable/removable behavior.
- [ ] Add trace verification tests for template-driven runs.

## 10. Acceptance Criteria
- Users can install and use all three starter templates on first launch.
- Templates are fully editable, cloneable, and removable.
- Dispatcher successfully routes general requests.
- Agent Architect produces valid manifest drafts.
- QA Auditor returns structured review verdicts with findings.
- No starter template bypasses standard policy and approval controls.
