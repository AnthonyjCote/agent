# Boundary Rules

These rules define architectural boundaries for building desktop and web targets in tandem from one codebase.

## 1) Core Boundary (`agent_core`)

- `agent_core` is portable Rust and owns shared business logic.
- `agent_core` must not depend on Tauri, Axum, or target-specific framework crates.
- `agent_core` should expose traits/interfaces for integrations (providers, tools, storage, events).

## 2) Adapter Boundaries (`agent_desktop`, `agent_server`)

- `agent_desktop` implements desktop adapters only (IPC, OS integrations, local runtime wiring).
- `agent_server` implements hosted adapters only (HTTP/WS/SSE, workers, webhook ingestion).
- Neither adapter crate should duplicate core orchestration/policy logic.

## 3) Provider Boundary

- Provider integrations must be adapter-based and provider-agnostic at runtime contract level.
- Supported adapter categories:
  - `CliProviderAdapter`
  - `ApiProviderAdapter`
  - `LocalProviderAdapter`
- Provider-specific parsing/mapping stays in provider adapters only.

## 4) UI and Transport Boundary

- UI consumes only `AgentRuntimeClient`.
- UI must not import Tauri APIs directly.
- Runtime transports are swappable:
  - `TauriTransport` for desktop
  - `HttpTransport` for web

## 5) Domain Boundary (Frontend)

- Route-level ownership belongs in `domains/<domain-name>/**`.
- Domain-neutral reuse belongs in `shared/**`.
- `shared/**` must not import from `domains/**`.
- Avoid cross-domain deep imports; promote reusable pieces to `shared/**`.

## 6) Schema Boundary

- Canonical schemas/events are shared and versioned.
- Desktop and web targets must emit/consume the same core schema contracts.
- Adapter mapping can vary by transport/provider, but canonical schema must remain stable.

## 7) Infra Boundary

- Secrets, queueing, OS keychain access, filesystem access, and webhook listeners belong to adapter/infrastructure layers.
- Core defines interfaces and policies for these concerns, not platform-specific implementation details.

## 8) Enforcement

- Enforce boundaries via code review and lint/CI checks where possible.
- Treat boundary violations as architecture defects.
- Prefer adding explicit interfaces over shortcut imports across layers.
