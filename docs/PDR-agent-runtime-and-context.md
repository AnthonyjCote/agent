# PDR — Agent Runtime, Provider Adapters, and Context Engine

## 1. Purpose
Define a provider-agnostic agent runtime that supports:
- multi-step agentic execution (planning, iteration, tool calling, approvals),
- inter-agent collaboration,
- multi-channel communication intake/dispatch (GUI, internal agent, email, SMS),
- memory/RAG retrieval across documents, databases, and web sources,
- desktop-first CLI provider integrations that work out of the box,
- app-managed conversation/context state with long-horizon retrieval.

## 2. Core Decisions
- Inference is adapter-driven and provider-specific.
- Orchestration is platform-owned and provider-agnostic.
- Communication channels are adapter-driven and channel-specific.
- Conversation history/context is owned by the app, not provider sessions.
- Desktop starts with CLI adapters (Gemini, Codex, Claude Code) using native auth flows.
- Same runtime contracts are used across desktop and server targets.

## 3. Architecture Boundaries

### 3.1 Provider Adapters (thin layer)
- Implement per-provider CLI adapters:
  - `GeminiCliAdapter`
  - `CodexCliAdapter`
  - `ClaudeCodeCliAdapter`
- Responsibilities:
  - CLI binary detection
  - auth readiness checks (native provider auth)
  - invocation/stream parsing
  - normalized error + usage mapping

### 3.2 Agent Runtime Core (heavy logic)
- Owns:
  - planning and multi-step execution
  - tool routing/policy/approval gates
  - inter-agent delegation and messaging
  - channel-agnostic message routing (`chat_ui|internal_agent|email|sms`)
  - run trace generation
  - context assembly policy
- Depends only on abstract inference port, never concrete providers.

### 3.4 Channel Adapters (thin layer)
- Implement channel adapters behind runtime channel ports:
  - `ChatUiChannelAdapter` (V1 active)
  - `InternalAgentChannelAdapter` (V1 active for delegation/consultation)
  - `EmailChannelAdapter` (V1 schema + ingress stub)
  - `SmsChannelAdapter` (V1 schema + ingress stub)
- Responsibilities:
  - channel ingress normalization into canonical message envelope
  - outbound delivery dispatch + status mapping
  - channel-specific metadata handling (headers, phone metadata, etc)

### 3.3 Context Engine (app-owned)
- App stores full history and artifacts.
- Prompt input is assembled per-run from:
  - recent raw turns
  - compressed summaries
  - retrieved long-term memory slices
  - active task and policy context

## 4. “Infinite Context” Strategy

### 4.1 Memory tiers
- Hot memory: recent turns/messages (direct prompt window).
- Warm memory: rolling summaries and structured compression.
- Cold memory: full transcript, run artifacts, tool outputs, document chunks.

### 4.2 Retrieval flow
1. Build intent/task retrieval query.
2. Fetch candidate context from warm/cold stores.
3. Rank/select context by relevance + budget.
4. Assemble prompt within token budget.
5. Keep citations/trace links to retrieved chunks.

### 4.3 Truncation policy
- Prompt window truncates by budget.
- Truncated content is never deleted from long-term stores.
- Retrieval can rehydrate previously truncated context as needed.

## 5. Desktop CLI “Done-for-You” Experience
- On startup or provider selection:
  - detect installed CLI executable,
  - detect auth/session readiness via provider-native mechanisms,
  - run a lightweight smoke prompt.
- Expose provider status states:
  - `ready`
  - `missing_cli`
  - `auth_required`
  - `misconfigured`
  - `error`
- Settings UI shows actionable remediation by provider.

## 6. Context De-duplication and Token Efficiency (Critical)
- Context optimization is a top-priority non-functional requirement.
- Non-essential context must be pruned before every model call.
- Agent profile blocks (name, role, directive, tool schema/policy) must be included once in the assembled runtime context and never repeatedly appended per turn.
- Repeated full system/tool payloads across turns are prohibited.
- Runtime must use context references/handles internally instead of re-inlining large static blocks each request.

### 6.1 Required de-duplication behavior
- Maintain a canonical static context segment per run/session:
  - agent identity block
  - directive block
  - tool capability/policy block
- Maintain dynamic context separately:
  - current task
  - recent turn window
  - retrieved memory snippets
  - compressed summaries
- Before send:
  - remove duplicate static blocks,
  - remove duplicate retrieved snippets,
  - drop non-essential metadata not used by inference.

### 6.2 Guardrails
- Add assembly-time checks that fail or warn if:
  - duplicate system block detected,
  - duplicate tool block detected,
  - duplicate agent profile block detected.
- Track per-run token diagnostics:
  - static tokens,
  - dynamic tokens,
  - deduplicated/pruned token count.

## 7. Contracts (Required)
- `ModelInferencePort` (send/stream/cancel/health/capabilities/usage)
- `ContextAssembler` (build prompt package from app memory)
- `MemoryRetriever` (ranked retrieval over hot/warm/cold stores)
- `ToolExecutionPort` (policy-aware tool invocation)
- `RunTracePort` (append-only structured event timeline)
- `ChannelPort` (inbound receive, outbound send, delivery status updates)

## 8. Data and Trace Requirements
- Canonical message schema independent of provider output format.
- Canonical channel envelope schema:
  - channel type, sender, recipient, thread id, correlation id, metadata.
- Canonical run-step schema for:
  - model events
  - tool calls
  - delegation/consultation events
  - channel ingress/egress events
  - delivery status events
  - approvals
  - retrieval operations
  - compression/summarization operations
- Usage accounting per run:
  - prompt/completion tokens
  - estimated cost
  - latency
  - tool count

## 9. Security and Safety
- Tool calls always pass through policy layer (allowlists/scopes/approvals).
- Secrets stored via secure platform-aware mechanisms.
- Retrieved content treated as untrusted input.
- Redaction and audit trace required for sensitive operations.

## 10. Granular Implementation Checklist

### Phase 0 — Contracts and Schemas
- [ ] Define TS + Rust canonical schemas for messages, run traces, provider health, capabilities.
- [ ] Define canonical channel envelope schema and delivery status schema.
- [ ] Define inference/context/memory/tool ports and version them.
- [ ] Define channel ports and version them.
- [ ] Add contract tests for serialization and compatibility.

### Phase 1 — Runtime Core Skeleton
- [ ] Scaffold `agent_core` modules for orchestration, context assembly, memory retrieval, trace append.
- [ ] Add pluggable policy engine for tool gating.
- [ ] Add deterministic run state machine with step ids and replay pointers.
- [ ] Add canonical static-vs-dynamic context partition in `ContextAssembler`.
- [ ] Add delegation state handling with linked parent/child run ids.

### Phase 2 — CLI Adapter Foundation
- [ ] Implement shared CLI adapter base (spawn, stream, timeout, cancel, parse hooks).
- [ ] Implement provider health-check protocol.
- [ ] Normalize provider outputs into canonical runtime events.

### Phase 3 — Provider Implementations (Desktop)
- [ ] Implement `GeminiCliAdapter` with native auth readiness checks.
- [ ] Implement `CodexCliAdapter` with native auth readiness checks.
- [ ] Implement `ClaudeCodeCliAdapter` with native auth readiness checks.
- [ ] Add smoke-run tests for each adapter (`ready`, `missing_cli`, `auth_required` paths).

### Phase 4 — Context Engine v1
- [ ] Implement hot/warm/cold memory interfaces.
- [ ] Add rolling summary pipeline for warm memory.
- [ ] Implement retrieval ranking and context budgeter.
- [ ] Log retrieval decisions in run trace.
- [ ] Implement prompt de-duplication pass for static blocks/snippets.
- [ ] Implement non-essential metadata pruning pass before inference send.
- [ ] Add token diagnostics for static/dynamic/pruned totals.

### Phase 5 — Tools and Agentic Execution
- [ ] Implement tool execution port with approval checkpoints.
- [ ] Implement multi-step planning + iteration loop.
- [ ] Implement inter-agent messaging/delegation contracts.
- [ ] Add guardrails for max iterations, max tool calls, and timeout budgets.
- [ ] Emit structured channel events for inbound/outbound/deferred delivery.

### Phase 6 — Settings and UX Integration
- [ ] Wire provider status + config to app-settings provider cards.
- [ ] Show actionable install/auth remediation per provider.
- [ ] Add runtime capability signals for desktop vs server behavior.
- [ ] Add channel capability signals (`email_enabled`, `sms_enabled`, `internal_agent_enabled`).

### Phase 7 — Observability and Replay
- [ ] Add append-only trace writer with structured event taxonomy.
- [ ] Build run replay loader from trace step `N`.
- [ ] Add context-assembly diagnostics (what got included/excluded and why).

### Phase 8 — Hardening and Performance
- [ ] Add context compression quality checks.
- [ ] Add retrieval precision/recall evaluation harness.
- [ ] Add stress tests for long-history conversations.
- [ ] Add CI checks for boundary violations and file-size risk.
- [ ] Add regression tests that fail on repeated system/tool/profile blocks in prompt assembly.
- [ ] Add channel delivery reconciliation tests (sent/delivered/failed/retried).

## 11. Acceptance Criteria
- Desktop can run at least one full chat flow through CLI adapter with native auth.
- Runtime orchestration remains provider-agnostic across adapters.
- App-managed context assembly controls all model input windows.
- Truncated history remains retrievable via memory engine.
- Run traces capture inference, retrieval, tools, and approvals end-to-end.
- Run traces capture delegation and channel delivery lifecycle events end-to-end.
- Assembled context contains only one instance of static agent/tool/directive blocks per run/session.
- Per-turn context includes pruning/de-duplication metrics and shows measurable token savings.
