# PDR — Agent-Oriented Desktop App (V1) with SaaS Path (V2)

## 1. Purpose
Build a **desktop-first agent studio** where users define their own agents (persona + directive + tools + memory), visualize relationships (org-chart + infinite canvas), and run real work with APIs/webhooks—while keeping the architecture **portable to a future web/SaaS version** without rewriting the UI.

---

## 2. Product Goals
- **User-authored agents**: users can create agents with unique personas, directives, and capabilities (tools + memory + relationships).
- **Premium UI**: 3D stacked “Agent Deck” with focus animation; only the front card is interactive.
- **Infinite canvas**: visually map relationships between agents (nodes + edges that represent policy + routing).
- **Real work execution**: tools, APIs, webhooks, and I/O with permissions, logs, and approvals.
- **Cost control**: routing + classical ML gates to reduce token use (triage, tool gating, retrieval gating).
- **Traceability**: every run is logged with a timeline and replayable steps.

---

## 3. Non-Goals (V1)
- Shipping a large library of pre-made agents.
- Multi-tenant cloud hosting, billing, enterprise SSO, compliance certifications.
- Heavy marketplace/social features (sharing, leaderboards, public directories).

---

## 4. Target Users
- Builders / power users / small teams who want **custom agent workflows**.
- Agencies and operators who need **repeatable automation** with visibility.
- Technical users who want local-first + “bring-your-own-model/provider.”

---

## 5. Experience Principles
- **Deck-first navigation**: agents feel like “characters” you can browse, focus, and operate.
- **Canvas is truth**: relationships drawn on the canvas define permissions + communication paths.
- **Safe-by-default tooling**: no “prompt says so” tool use—everything goes through permissions + policy.
- **Debuggable**: tracing is not optional; runs can be replayed.

---

## 6. Core Concepts & Data Model

### 6.1 Agent Manifest (versioned asset)
Each agent is a versioned object (editable + exportable):
- Identity: `name`, `avatar`, `tags`
- Persona: `tone`, `style`, `system_directive`
- Domain: `role`, `domain`, `constraints`
- Tools: allowed tools + scopes + approval requirements
- Memory: RAG namespace(s), retention, indexing rules
- Relationships: allowed messaging, delegation paths, shared memory rules
- Channel identity refs: optional email address/phone refs + channel policy pointers

### 6.2 Relationship Graph (policy edges)
Edges are not just visual lines—they encode “who can do what”:
- `MANAGES` (delegation permitted)
- `ROUTES_TO` (triage/routing)
- `REVIEWS` (approval gate)
- `CAN_MESSAGE` (communication allowed)
- `SHARES_MEMORY` (read / read-write, optional)

### 6.3 Run + Trace
A “run” is a unit of execution:
- Input payload + context snapshot (agent manifest version + permissions)
- Steps: model calls, retrieval, tool calls, approvals
- Artifacts: outputs, files, structured results
- Metrics: tokens/cost/time/tool calls
- Replay pointers: resume from step N with changes

### 6.4 Channel Message Model
All communication is normalized to a common envelope:
- `channel`: `chat_ui | internal_agent | email | sms`
- sender/recipient ids
- thread + correlation ids
- channel metadata (subject, headers, phone metadata)
- delivery state lifecycle (`queued|sent|delivered|failed|retried`)
- persisted per-agent inbox/outbox records

---

## 7. Architecture Overview (Dual-Target: Desktop + Web)

### 7.1 Guiding constraint
**UI must not depend on “desktop-only” APIs.**  
The UI only talks to a single interface: `AgentRuntimeClient`.
There is exactly one maintained frontend UI codebase for both desktop and web targets.

### 7.2 Three layers (portable)
1) **UI (shared)**  
   Single React/TS app (one codebase) used by both desktop and web targets:
   Agent Deck, Canvas, Chat, Editor, Run Console

2) **Runtime Client (shared)**  
   A thin TS library that exposes functions like:
   - `listAgents()`
   - `getAgent(id)`
   - `updateAgent(id, patch)`
   - `chat(agentId, message, opts)`
   - `run(agentId, task, opts)`
   - `subscribeEvents(filter)` (stream status/tokens/tool approvals)
   - `getRunTrace(runId)`

3) **Runtime Implementation (swapable)**
   - **Desktop target**: Tauri IPC → Rust runtime
   - **Web target**: HTTP + WS/SSE → Rust server runtime

**Result:** same UI, same client interface, different transport.

### 7.4 Capability-driven target behavior
Target differences are handled through runtime capabilities, not separate UIs.

- Example capability flags:
  - `supportsFileSystemAccess`
  - `supportsHostedWebhooks`
  - `supportsLocalListener`
- UI behavior branches on capability flags from runtime, while keeping the same UI surface/components.

### 7.3 Provider-agnostic agent runtime (required)
The agentic layer must be internal and universal.  
The GUI must never couple to a specific model/provider implementation.

- Define a stable internal provider contract (send/receive, streaming, cancellation, capabilities, errors, usage).
- Implement provider adapters behind that contract:
  - `CliProviderAdapter`
  - `ApiProviderAdapter`
  - `LocalProviderAdapter`
- Provider-specific parsing, command invocation, and request mapping stay inside adapters only.
- UI and domain logic consume only `AgentRuntimeClient` + normalized runtime events.

### 7.5 Channel-adapter runtime boundary (required)
Communication channels are adapter-based, parallel to model adapters:
- `ChatUiChannelAdapter` (active in V1)
- `InternalAgentChannelAdapter` (active in V1 for delegation/consultation)
- `EmailChannelAdapter` (schema + ingress stubs in V1)
- `SmsChannelAdapter` (schema + ingress stubs in V1)

Runtime owns orchestration and policy. Channel adapters only map ingress/egress payloads.

---

## 8. Desktop Runtime Target (Built in Tandem with Web)

### 8.1 Frontend
- React + TypeScript
- Vite
- Framer Motion (deck animations, focus transitions)
- Tailwind (or CSS modules)
- Infinite canvas:
  - **React Flow** (graph + pan/zoom “infinite” workspace) for V1
  - Optional later: tldraw for freeform mapping, with a graph overlay mode

### 8.2 Desktop Container
- Tauri v2 (Rust backend + web UI)

### 8.3 Local Storage
- SQLite for structured data (agents, relationships, runs, settings, inbox/outbox, delegation records)
- Indexing/RAG options (choose one for V1, keep interfaces abstract):
  - BM25: Tantivy (fast local search)
  - Vectors: embedded store (e.g., sqlite-backed or a local vector DB)
  - Hybrid retrieval: BM25 + vectors + optional rerank (only when needed)

### 8.4 Model & ML Gates
- Routing/classification via lightweight models:
  - simple rules + small ONNX models where helpful
- LLM provider “bring-your-own” via adapter architecture:
  - CLI agents
  - API agents
  - locally hosted agents
- V1 starts with **Gemini CLI** adapter due to generous free-tier access.
- Gemini is the first adapter, not a hard dependency of UI or runtime contracts.

---

## 9. V1 Feature Scope

### 9.1 Agent Deck (premium UI)
- 3D stacked deck with skewed cards
- Left/right navigation (mouse, trackpad, keyboard)
- Only the **front-facing focused card** is interactive:
  - Chat
  - Run / Task
  - Edit
  - Logs/Trace
  - Status + last activity
- Side cards: muted + overlapped; non-interactive

### 9.2 Agent Editor
- Identity: name, avatar, tags
- Persona: directive, tone/style presets, response format preferences
- Tools: allowlist + scopes + approval gates
- Memory: attach sources, indexing settings, retention
- Relationships: quick jump to canvas and edge settings

### 9.3 Infinite Canvas (relationships)
- Create/move nodes (agents)
- Draw typed edges (manages/routes/reviews/message/share memory)
- Canvas edges update policy in real time
- Basic auto-layout (optional) + search/zoom-to-agent

### 9.4 Work Execution + I/O
- Tool system with:
  - tool definitions (REST, webhook, file ops, custom scripts)
  - secret storage (encrypted + OS keychain integration if available)
  - policy wrapper (allowlist hosts, rate limit, approval required)
- Webhooks (V1):
  - local listener for inbound events (dev + local automation)
  - map webhook → triggers agent run
- Channel ingress (V1 foundations):
  - internal agent messaging/delegation active
  - email/sms ingress API stubs available for later connector rollout

### 9.5 Run Console (trace + replay foundation)
- Timeline view of steps
- Tool call inspector (request/response with redaction)
- Approvals panel (pending actions requiring user confirmation)
- Export run trace (json) for support/debug

---

## 10. Web/SaaS Runtime Target (Built in Tandem with Desktop)

### 10.1 Multi-tenancy
- Tenant isolation for:
  - agents
  - memory stores
  - secrets
  - runs/traces
- Strong authorization model:
  - per-user + per-agent tool permissions
  - role-based access for teams/orgs

### 10.2 Hosted runtime
- Rust server (e.g., Axum)
- API:
  - HTTP for CRUD
  - WebSocket/SSE for streaming tokens/status/events
- Background workers:
  - run queue + retries
  - webhook ingestion endpoints
  - scheduled jobs (optional)

### 10.3 Secrets & Compliance
- Server-side secrets vault (KMS-backed)
- Audit logs (tool calls, access, exports)
- Data retention policies
- Optional customer-managed keys (enterprise later)

### 10.4 Billing/limits (eventual)
- Metering based on:
  - tokens
  - tool calls
  - storage (documents, embeddings)
  - run time
- Quotas and budgets enforced by policy engine (same concept as V1)

### 10.5 Web sandboxing constraints
Some desktop-native capabilities must be redesigned for SaaS:
- file system access → replace with uploads + scoped storage
- localhost-only webhooks → provide hosted webhook endpoints
- local model execution → either client-side WASM (limited) or hosted inference

---

## 11. Compatibility Strategy (Do This Early)

### 11.1 Stable schemas
Define stable JSON schemas now:
- AgentManifest v1
- RelationshipGraph v1
- ToolDefinition v1
- RunTrace v1
- EventStream messages v1

### 11.2 Runtime client abstraction
Implement `AgentRuntimeClient` with pluggable transports:
- `TauriTransport` (invoke + events)
- `HttpTransport` (fetch + ws/sse)

UI imports only the client, never direct Tauri APIs.

### 11.3 Engine core in portable Rust crate
Create `agent_core` crate with **no Tauri dependencies**:
- graph execution
- routing gates
- tool policy enforcement
- trace generation
- memory interfaces (traits)

Tauri app and Server app both depend on `agent_core`.

### 11.4 Hard boundaries (non-negotiable)
- `agent_core` must remain portable Rust with no Tauri/Axum/web framework dependencies.
- `agent_desktop` and `agent_server` are adapter layers around `agent_core`, not duplicate business logic.
- Provider integrations stay behind provider adapter contracts; no provider-specific UI paths.
- Shared schemas/events stay canonical across desktop and web targets.
- Rust implementation must follow `docs/RUST-ARCHITECTURE-RULES.md` (module boundaries, file-size limits, trait-first seams, CI checks).

---

## 12. Security Model (V1 → V2 consistent)

### 12.1 Tool permissioning
- per-agent tool allowlist
- per-tool scopes (hosts, verbs, paths)
- approval gates (preflight prompt before POST/DELETE, money movement, etc.)
- redaction rules for logs (tokens, secrets, PII patterns)

### 12.2 Event and run integrity
- immutable run traces (append-only)
- signed/hashed steps optional (future)

### 12.3 Prompt injection hardening (RAG)
- treat retrieved content as untrusted
- isolate retrieved text from system directives
- citation + source visibility in trace

---

## 13. Repo / Monorepo Layout (Suggested)

- frontend/
  - src/
    - app/              (shell, routing, providers, app-level concerns)
    - shared/           (domain-neutral UI/config/modules)
      - config/
      - modules/
      - ui/
    - domains/          (route/view ownership; one folder per top-level view)
      - `<domain>/`
        - api/
        - lib/
        - model/
        - modules/
        - surface/
        - view.tsx
        - index.ts
    - assets/
- backend/
  - crates/
    - agent_core/       (portable engine + policies + traces)
    - adapter/          (provider/runtime adapter contracts + shared adapter utilities)
    - agent_desktop/    (desktop adapter bindings + local runtime integrations)
    - agent_server/     (server adapter bindings + hosted runtime integrations)
  - targets/
    - tauri-desktop/    (desktop packaging/wrapper target)
    - server/           (server binary target)
- packages/
  - runtime-client/     (AgentRuntimeClient + transports)
  - schemas/            (JSON schema + versioning utilities)

---

## 14. MVP Acceptance Criteria (V1)
- User can create 3+ agents, assign avatars/names, and define directives.
- Agent Deck is smooth, focused-card-only interaction works, and core buttons function:
  - Chat / Edit / Run / Logs
- Infinite canvas can connect agents and those edges affect routing/permissions.
- Tool system can execute at least:
  - one REST connector (user-provided API key)
  - one webhook trigger (local listener)
- Agent runtime can complete chat/run flows via at least one provider adapter:
  - **Gemini CLI adapter** implemented first
  - runtime contract remains provider-agnostic for additional CLI/API/local adapters
- Both runtime targets compile from the same monorepo boundaries:
  - desktop target (`agent_desktop` + `TauriTransport`)
  - web target (`agent_server` + `HttpTransport`)
- A single frontend UI codebase (`frontend/src`) is used by both targets.
- Target-specific behavior is capability-driven; no separate desktop/web UI variants.
- Rust crates satisfy architecture guardrails:
  - `agent_core` contains no Tauri/Axum dependencies
  - no monolith Rust files beyond defined thresholds without explicit allowlist
  - core/adapter responsibilities remain separated
- Run console shows:
  - step timeline
  - tool call details (redacted)
  - final output
- Inter-agent delegation events are traceable and persisted.
- Per-agent inbox/outbox records persist and render consistently in desktop and web targets.

---

## 15. Key Risks & Mitigations
- **Deck UI performance**: keep 60fps by limiting live shadows/blur; animate transforms only; virtualize offscreen.
- **Complexity creep in graph execution**: start with 2–3 relationship patterns (manager/workers, router/specialists, review gates).
- **Tool security**: strict allowlists, approvals, and secret vault from day one.
- **SaaS migration pain**: solved by schema/versioning + runtime-client abstraction + portable agent_core crate.

---

## 16. Dual-Target Delivery Plan (High Level)
1) Establish stable schemas and runtime-client abstraction first.
2) Build and maintain `agent_desktop` and `agent_server` in tandem on top of `agent_core`.
3) Implement and maintain both `TauriTransport` and `HttpTransport` in parallel.
4) Keep UI provider/runtime interactions transport-agnostic.
5) Add web-specific concerns (multi-tenancy, hosted webhooks, metering) without changing core contracts.
6) Ship desktop as local-first and web as hosted, with shared behavior parity targets.

---

## 17. Open Decisions (Keep Explicit)
- Choose V1 vector storage (embedded DB vs local vector DB)
- Choose canvas library path (React Flow only vs hybrid with tldraw)
- Decide minimum tool set for V1 (REST + webhook + filesystem? or postpone filesystem tool)
- Decide first “golden path” relationship templates (recommended: Manager/Workers + Review Gate)
- Define the next adapters after Gemini CLI (API provider and first local-hosted provider)
