# PDR (Temp) — Runtime + Gemini CLI Adapter + Multi-Action Tooling V1

## 1. Purpose
Ship the fastest credible path from current scaffold to:
- chatting with selected agents in GUI,
- running model-led multi-step execution,
- executing multiple tool actions in a single request,
- using shared Rust runtime crates for both desktop and server targets.

This is a temporary implementation PDR focused on build order and execution details.

## 2. Scope
- In scope:
  - Rust runtime core (`agent_core`) and provider adapter boundary.
  - Gemini CLI adapter (`adapter/gemini`) using headless mode.
  - GUI <-> backend streaming loop for agent replies and tool events.
  - Tool framework + first tool (`weather_open_meteo`).
  - Persistence of agents, threads, messages, run traces.
- Out of scope (later PDRs):
  - Full enterprise auth, billing, quotas UI.
  - Advanced conflict resolution UX.
  - Full PM/CRM/email tool suites (only scaffold and sequence planning here).

## 3. Verified Gemini CLI Notes (Internet, March 2026)
Primary sources used:
- Gemini CLI repo: https://github.com/google-gemini/gemini-cli
- Headless docs: https://geminicli.com/docs/cli/headless/
- Auth docs: https://geminicli.com/docs/get-started/authentication/
- CLI cheatsheet/options: https://geminicli.com/docs/cli/cli-reference/
- Release notes: https://geminicli.com/docs/changelogs/

Implementation-relevant facts:
- Headless supports `--output-format text|json|stream-json`.
- Streaming mode emits JSONL events including `init`, `message`, `tool_use`, `tool_result`, `error`, `result`.
- Headless exit codes documented: `0`, `1`, `42`, `53`.
- Headless auth recommendation: API key or Vertex for non-interactive use.
- CLI options include `--model`, `--approval-mode`, `--resume`, `--include-directories`, `--allowed-tools` (deprecated in favor of policy engine).
- Release notes indicate stream-json and non-interactive features have changed over versions; runtime must include startup capability checks.

## 4. Architecture Constraints
- Runtime/business logic lives in Rust crates, not tauri target crates.
- Tauri target and server target are thin wrappers calling shared runtime APIs.
- Provider-specific logic isolated in adapter crate modules.
- Tools are co-located and segmented by folder (one folder per tool).
- No monolith scripts; each module has single responsibility.

## 5. Target Rust Module Layout
- `backend/crates/agent_core/src/`
  - `runtime/` (`run_loop`, `step_controller`, `stop_conditions`)
  - `context/` (`assembler`, `budgeter`, `deduper`)
  - `orchestration/` (`agent_router`, `delegation`, `turn_state`)
  - `tools/`
    - `registry/`
    - `shared/`
    - `weather_open_meteo/`
  - `models/` (`message`, `thread`, `trace`, `usage`, `events`)
  - `ports/` (`model_inference`, `tool_exec`, `memory`, `trace_store`)
  - `policy/`
- `backend/crates/adapter/src/`
  - `provider_adapter.rs`
  - `gemini/` (`detect`, `auth_check`, `invoke_stream`, `parse_events`, `errors`)
- `backend/crates/agent_server/src/`
  - `http/` + `ws/` API only
- `backend/crates/agent_desktop/src/`
  - command handlers only (no runtime logic duplication)

## 6. End-State Behavior (V1)
- User picks agent in GUI, sends prompt.
- Runtime executes model-led loop with guardrails.
- For simple prompt: one model response streamed to GUI.
- For multi-action prompt: runtime performs multiple tool calls (e.g., weather Edmonton today + Vancouver tomorrow), then composes final answer.
- GUI shows:
  - assistant stream text,
  - tool activity timeline,
  - final response,
  - run status/errors.

## 7. Granular Implementation Checklist

### Phase 0 — Contracts Freeze (Day 0, first commit set)
- [ ] Define canonical Rust structs/enums:
  - `RunRequest`, `RunEvent`, `ToolCallRequest`, `ToolCallResult`, `RunUsage`, `RunError`.
- [ ] Define stable JSON wire schema mirrored in TS `packages/schemas`.
- [ ] Define channel-agnostic message envelope contract:
  - `channel`: `chat_ui | internal_agent | email | sms`
  - `sender`, `recipient`, `thread_id`, `task_id`, `correlation_id`
  - channel metadata payload (headers, subject, phone metadata, etc).
- [ ] Define typed `MessageBlock` schema (shared Rust + TS) for structured GUI rendering:
  - `assistant_text`
  - `tool_call`
  - `tool_result`
  - `system_notice`
  - `error`
  - `table` (reserved)
  - `chart_spec` (reserved)
  - `file_artifact` (reserved)
- [ ] Add crate-level README codemap for each new folder.
- [ ] Add compile-time module boundaries (`mod.rs`) before logic.

### Phase 1 — Runtime Skeleton in Rust
- [ ] Implement `ModelInferencePort` trait (sync/stream/cancel/health).
- [ ] Implement `ToolExecutionPort` trait.
- [ ] Implement `TraceStorePort` trait.
- [ ] Implement `ChannelPort` trait family:
  - inbound intake (`poll/receive`)
  - outbound dispatch (`send`)
  - delivery status updates.
- [ ] Implement `RunLoop` state machine:
  - states: `Init -> ModelStep -> ToolStep -> ModelStep -> Completed|Failed|Cancelled`.
- [ ] Add inter-agent orchestration events and states:
  - `DelegationRequested`
  - `DelegationAccepted|Rejected`
  - `DelegationCompleted|Failed`
  - `ConsultationRequested|Responded`.
- [ ] Add hard guardrails:
  - max iterations,
  - max tool calls,
  - max wall-clock duration.
- [ ] Emit structured `RunEvent` at every transition.

### Phase 2 — Gemini CLI Adapter (Headless)
- [ ] Add binary detection (`which gemini` / spawn probe).
- [ ] Add version probe (`gemini --version`) and parse.
- [ ] Add capability probe command at startup:
  - check `--output-format stream-json` support.
- [ ] Implement auth readiness checks:
  - detect cached auth availability OR env-based key setup.
  - classify states: `ready|auth_required|missing_cli|error`.
- [ ] Implement non-interactive invocation builder:
  - model flag wiring,
  - prompt assembly,
  - deterministic args order.
- [ ] Implement stream parser for JSONL events:
  - map Gemini events -> internal `RunEvent`.
- [ ] Map adapter events into block-ready runtime outputs (`MessageBlock[]`) so GUI can render structured cards.
- [ ] Implement exit-code mapping:
  - handle `0/1/42/53` into typed runtime errors.
- [ ] Implement fallback strategy:
  - if `stream-json` unsupported, fallback to `json` then `text`.
- [ ] Add adapter integration tests with fixture streams.

### Phase 3 — Runtime Context + Prompt Packaging
- [ ] Implement context assembler with static/dynamic separation.
- [ ] Ensure agent identity/directive/tools are inserted once.
- [ ] Add dedupe pass for repeated snippets/metadata.
- [ ] Add token budget partition:
  - static budget,
  - recent history budget,
  - retrieved context budget.
- [ ] Log per-run context diagnostics (included/pruned token counts).

### Phase 4 — Tool Framework
- [ ] Implement tool manifest contract:
  - name, description, input schema, output schema.
- [ ] Implement tool registry with explicit allowlist.
- [ ] Implement tool call validation + typed coercion.
- [ ] Implement execution wrapper:
  - timeout,
  - retries (limited),
  - structured error mapping.
- [ ] Emit `tool_use` and `tool_result` events to run trace.

### Phase 5 — First Tool: Open-Meteo Weather
- [ ] Add `tools/weather_open_meteo/` with:
  - `manifest.rs`
  - `input.rs`
  - `client.rs`
  - `mapper.rs`
  - `execute.rs`
- [ ] Implement location resolution flow:
  - geocode endpoint (city -> lat/lon),
  - weather forecast endpoint.
- [ ] Implement date normalization in runtime:
  - parse `today/tomorrow` relative to user timezone.
- [ ] Implement comparative multi-call support in one run.
- [ ] Add tool tests:
  - single location/day,
  - two-location comparative query,
  - invalid location handling.

### Phase 6 — Server API + Desktop Command Surface
- [ ] Server target:
  - `POST /runs` (start),
  - `GET /runs/:id/events` (SSE or WS stream),
  - `POST /runs/:id/cancel`.
- [ ] Add channel ingress endpoints for future external adapters:
  - `POST /channels/email/inbound` (stub in V1),
  - `POST /channels/sms/inbound` (stub in V1),
  - `POST /channels/internal-agent/inbound`.
- [ ] Desktop target (Tauri command layer):
  - `start_run`,
  - `subscribe_run_events`,
  - `cancel_run`.
- [ ] Ensure both targets call same `agent_core` runtime API.

### Phase 7 — Frontend Runtime Wiring
- [ ] Update runtime client package to support run stream subscription.
- [ ] Wire chat domain to send run requests (agent id + thread id + prompt).
- [ ] Render streaming assistant text incrementally.
- [ ] Render tool activity cards/timeline in chat UI.
- [ ] Implement block renderer registry (`block.type -> shared UI component`).
- [ ] Implement baseline block components:
  - text block renderer,
  - tool call block renderer,
  - tool result block renderer,
  - system/error notice renderer.
- [ ] Persist messages and run events via repository boundary.
- [ ] Add visible run states: `running|waiting_tool|failed|completed`.

### Phase 8 — Multi-Action Execution Semantics
- [ ] Implement model-led loop control with deterministic stop guards only.
- [ ] Enable multiple tool calls per user turn.
- [ ] Add continuation criteria:
  - stop when model returns final response event,
  - stop on guardrail breach,
  - stop on explicit cancel.
- [ ] Add delegation continuation criteria:
  - parent run waits on delegated run result when required,
  - delegated failure maps to explicit parent decision branch.
- [ ] Add retry-on-transient-error policy for tool/network failures.

### Phase 9 — Persistence + Trace (minimum production shape)
- [ ] Persist agent/thread/message/run entities in repository layer.
- [ ] Persist `MessageBlock[]` with each assistant/system message (no lossy text-only collapse).
- [ ] Persist tool call records with args/result summaries.
- [ ] Persist per-agent inbox/outbox stores (day-1 schema, even before email/sms go live):
  - `agent_inbox`
  - `agent_outbox`
  - include channel, delivery status, timestamps, correlation IDs.
- [ ] Persist delegation records:
  - `delegation_request`
  - `delegation_result`
  - status lifecycle and linked run IDs.
- [ ] Add run replay endpoint for debugging.
- [ ] Add minimal telemetry:
  - model latency,
  - tool latency,
  - step count,
  - token usage when available.

### Phase 10 — Validation, QA, and Demo Scenarios
- [ ] E2E scenario 1: single-step factual question.
- [ ] E2E scenario 2: weather today in one city (one tool call).
- [ ] E2E scenario 3: weather today in Edmonton + tomorrow in Vancouver (multi-call same run).
- [ ] E2E scenario 4: malformed prompt requiring clarification.
- [ ] E2E scenario 5: adapter unavailable/auth-required graceful errors.
- [ ] Verify same behavior from:
  - `npm run dev:desktop`
  - `npm run dev:server`

## 8. Immediate Execution Order (Velocity-First)
1. Phase 0 + Phase 1 contracts/state machine.
2. Phase 2 Gemini adapter with stream-json.
3. Phase 6 transport (server first, then desktop command mirror).
4. Phase 7 GUI streaming integration.
5. Phase 4 + 5 weather tool.
6. Phase 8 multi-action loop hardening.
7. Phase 9 persistence/trace hardening.

## 9. Definition of Done (V1)
- Agent selected in GUI can answer via Gemini adapter through runtime.
- At least one tool (`weather_open_meteo`) runs in production path.
- One user message can trigger multiple tool actions in a single run.
- Same runtime crate path used by desktop and server targets.
- Run/event traces visible in GUI and persisted.
- Failure paths return structured user-visible errors without app crash.

## 10. Risks and Mitigations
- Gemini CLI surface can evolve quickly:
  - Mitigation: capability probes at startup + graceful fallback from `stream-json`.
- Tool-call loops can overrun costs:
  - Mitigation: strict max iterations/tool calls/timeouts + trace visibility.
- Context bloat/regression:
  - Mitigation: static/dynamic partition + dedupe diagnostics in CI checks.
- Late rich-UI additions (charts/tables/artifacts) causing schema churn:
  - Mitigation: reserve block types in V1 contracts and persist blocks natively from the start.
- Adding email/sms/inter-agent flows later could cause runtime rewrites:
  - Mitigation: ship channel envelope + inbox/outbox + delegation schema on day 1.
