# PDR — Model-Led Execution and Governance

## 1. Purpose
Define how Agent Deck supports autonomous multi-action execution for complex business tasks while preserving cost, safety, and operational control.

## 2. Core Decision
- Task execution is model-led.
- Runtime governance is policy-bounded.
- Runtime does not deterministically decide business completion logic.
- Runtime does enforce risk, budget, and side-effect controls.

## 3. Goals
- Enable agents to complete complex multi-step work with minimal user interruption.
- Allow model discretion for sequencing, tool choice, and completion judgment.
- Prevent runaway cost, unsafe actions, and silent quality failures.
- Support “AI-run company” workflows with auditable traces.

## 4. Non-Goals
- Building a rigid deterministic finite-state controller for all reasoning.
- Forcing fixed step/tool limits regardless of task class.
- Blind trust in model completion without evidence checks.

## 5. Execution Model

### 5.1 Model-led action loop
Per user task, the model iterates autonomously:
1. assess objective and current state
2. choose next action (`tool`, `delegate`, `respond`, `request_input`, `complete`)
3. execute action
4. evaluate progress against completion criteria
5. continue or complete

### 5.2 Runtime role
Runtime is responsible for:
- policy enforcement,
- budget enforcement,
- trace and audit,
- approvals for high-risk side effects,
- structured completion validation.

## 6. Governance Framework

### 6.1 Adaptive budgets (not hard fixed limits)
Each task starts with a budget profile:
- `small`
- `standard`
- `deep`

Each profile defines initial envelopes:
- token budget
- wall-time budget
- tool usage budget by risk tier

Budget extension flow:
- agent can request extension with justification
- low-risk extensions auto-approve under policy
- high-cost/high-risk extensions require approval

### 6.2 Tool risk tiers
- `low`: read-only, non-destructive, low external impact
- `medium`: write operations with bounded impact
- `high`: destructive actions, money movement, legal/security sensitive operations

Policy behavior:
- low: autonomous by default
- medium: logged + rate-governed
- high: explicit approval gate required

### 6.3 Completion contracts
Every task includes a completion contract:
- objective
- acceptance criteria
- required artifacts/evidence
- quality checks

Model must emit structured completion claim:
- `status`
- `criteria_check_results`
- `artifact_refs`
- `remaining_risks`

Runtime validates structure/presence of evidence, not model reasoning internals.

### 6.4 Reviewer-agent pattern
Use a reviewer agent for quality control on complex/high-impact tasks:
- executor agent performs work
- reviewer agent evaluates completion claim and artifacts
- mismatch or low confidence triggers escalation

### 6.5 Reviewer invocation policy (simple flags)
Reviewer invocation uses policy flags, not scoring.

Task review policy values:
- `none`
- `conditional` (default)
- `always`

When policy is `conditional`, run reviewer if any flag is true:
- high-risk tool used
- budget extension requested
- completion evidence missing or incomplete
- completion confidence below threshold

Review depth:
- run `lite` review first
- run `full` review only if `lite` returns `fail` or `uncertain`

Throughput rule:
- no arbitrary reviewer call caps/quotas are used as a control mechanism
- scaling is managed via policy scope, conditional flags, and lite-vs-full review depth

## 7. Context and Cost Rules
- Keep model prompts minimal and purpose-scoped per iteration.
- Maintain app-owned state and memory outside prompt.
- Send only required context slices per step.
- Do not re-send static agent/tool blocks repeatedly.
- Log per-iteration token economics:
  - prompt
  - completion
  - pruned
  - retrieved

## 8. Required Contracts
- `ExecutionPolicyPort` (risk tiers, approvals, budget rules)
- `BudgetManager` (track, enforce, extend budgets)
- `CompletionContract` (objective + acceptance schema)
- `CompletionValidator` (evidence/criteria validation)
- `ToolRiskClassifier` (classify and gate tool calls)
- `ReviewerEvaluationPort` (optional second-agent quality pass)

## 9. UX Requirements
- Show live run state:
  - current step
  - budget usage
  - pending approvals
  - completion confidence/claim status
- Show extension requests with concise justification and impact.
- Show high-risk action warnings before approval.
- Show final completion packet with evidence links.

## 10. Granular Implementation Checklist

### Phase 0 — Policy and Schema
- [ ] Define budget profile schema (`small`, `standard`, `deep`).
- [ ] Define tool risk tier schema (`low`, `medium`, `high`).
- [ ] Define `CompletionContract` and completion claim schemas.
- [ ] Define run-trace event schema for budget and approvals.

### Phase 1 — Runtime Governance Core
- [ ] Implement `BudgetManager` with real-time counters.
- [ ] Implement `ExecutionPolicyPort` and policy lookup resolution.
- [ ] Implement approval gate service for high-risk actions.
- [ ] Add trace hooks for policy decisions and gate outcomes.

### Phase 2 — Model-Led Loop Integration
- [ ] Integrate model action loop with runtime governance checks.
- [ ] Support next-action types (`tool`, `delegate`, `respond`, `request_input`, `complete`).
- [ ] Enforce policy checks before each side-effect action.
- [ ] Add graceful stop behavior on budget exhaustion.

### Phase 3 — Adaptive Budget Extensions
- [ ] Implement extension request protocol with model-provided rationale.
- [ ] Implement auto-approval rules for low-risk extensions.
- [ ] Implement user/reviewer approval path for high-risk extensions.
- [ ] Add extension outcomes to run trace.

### Phase 4 — Completion Contracts
- [ ] Implement task-level completion contract creation.
- [ ] Require structured completion claims from executor.
- [ ] Implement completion validator for required evidence and criteria coverage.
- [ ] Block final completion when contract validation fails.

### Phase 5 — Reviewer Agent
- [ ] Implement optional reviewer execution pass.
- [ ] Define disagreement policy (`approve`, `revise`, `escalate`).
- [ ] Record reviewer findings in run trace and completion packet.
- [ ] Implement reviewer policy modes (`none`, `conditional`, `always`).
- [ ] Implement conditional flag checks (high-risk tool, extension requested, missing evidence, low confidence).
- [ ] Implement lite-first then full-on-fail/uncertain review depth behavior.

### Phase 6 — UX and Observability
- [ ] Add run console panels for budget usage and approval gates.
- [ ] Add completion packet UI with criteria + artifacts.
- [ ] Add token and tool-economics summaries per run.
- [ ] Add alerting for repeated budget extension failures.

### Phase 7 — Hardening
- [ ] Add regression tests for runaway loop prevention.
- [ ] Add tests for policy bypass attempts.
- [ ] Add tests for completion-without-evidence rejection.
- [ ] Add load tests for long-running autonomous tasks.

## 11. Acceptance Criteria
- Agents can perform multi-action autonomous runs without fixed deterministic stop logic.
- Runtime enforces risk and budget envelopes consistently.
- High-risk actions require explicit approval.
- Completion requires structured claim + evidence against contract criteria.
- Budget extensions are adaptive and policy-governed.
- Runs are fully auditable with policy, budget, and completion events.
- Reviewer invocation follows simple policy flags and review modes (no scoring model).
- No hard reviewer call caps are required for normal throughput control.
