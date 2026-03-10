# PDR (Temp): App Domain Architecture Consolidation v1

## Status
- In Progress
- Date: 2026-03-10
- Owner: Domain Architecture

## Progress (2026-03-10)
- Added domain port contracts:
  - `app_domains/org/src/ports.rs`
  - `app_domains/comms/src/ports.rs`
- Added `app_persistence` adapter implementations for domain ports:
  - `app_persistence/src/domain_ports.rs`
- Runtime shared app-tool backend now uses domain service entrypoints and domain ports through persistence adapters.
- Remaining work: move org/comms business orchestration from `app_persistence` into `app_domains` service modules.

## Context
We now have dedicated domain crates scaffolded:
- `crates/app_domains/core`
- `crates/app_domains/org`
- `crates/app_domains/comms`

The codebase still carries domain behavior in `app_persistence` and dispatch glue in runtime services. We need a stable ownership model before adding CRM, tasks, PM, ERP, and future domains.

## Decision
Use domain crates as the canonical home for business logic and workflow rules.

### Ownership Rules

`app_domains/*` owns:
- business rules
- use-case orchestration
- domain-level validation
- domain models
- repository trait contracts

`app_persistence` owns:
- storage adapters implementing domain repository traits
- SQL/file persistence and transaction boundaries
- state mapping and record storage concerns

`agent_core` owns:
- runtime execution and tool contracts
- tool handler to domain-service bridging
- model/tool IO envelope shaping

`agent_server` and `agent_desktop` own:
- transport/runtime wiring only
- no domain business logic

## Target Domain Crate Shape

Each domain crate should converge on:
- `models.rs` (or `models/`)
- `service.rs` (or `services/`)
- `ports.rs` (repository/service trait contracts)
- `errors.rs` (domain-local error variants if needed)
- `lib.rs` exports

Shared cross-domain primitives remain in `app_domains/core`.

## Dependency Direction
- `agent_core` -> `app_domains/*`
- `app_domains/*` -> `app_domains/core`
- `app_persistence` -> `app_domains/*` (to implement ports)
- `agent_server`/`agent_desktop` -> `agent_core` + `app_persistence`

Disallowed:
- `app_domains/*` depending on `agent_core`
- `app_domains/*` depending on `agent_server`/`agent_desktop`
- business rules in `app_persistence`

## Initial Scope (Now)
- Consolidate `org` and `comms` business logic into `app_domains/org` and `app_domains/comms`.
- Keep parity for existing org/comms tools and UI behavior.

## Next Scope (Later)
- Add `app_domains/tasks`, `app_domains/pm`, `app_domains/crm` with same pattern.
- Reuse `app_domains/core` for shared IDs/errors/contracts.

## Acceptance Criteria
- Org/comms business logic is domain-owned (not persistence-owned).
- Persistence crate is adapter-only for domain ports.
- New domains can be added without touching runtime service internals.
- Dependency graph follows the allowed direction above.

## Risks
- Temporary duplicate logic during migration.
- Trait boundary churn while extracting existing code.

## Mitigations
- Move one bounded use-case cluster at a time.
- Keep temporary compatibility adapters until parity is verified.
- Add small domain tests for key invariants before deleting old paths.

## Implementation Checklist
- [ ] Add `ports.rs` traits to `app_domains/org` and `app_domains/comms`.
- [ ] Move org business orchestration from persistence into `app_domains/org`.
- [ ] Move comms business orchestration from persistence into `app_domains/comms`.
- [ ] Implement domain ports in `app_persistence`.
- [ ] Update tool handlers in `agent_core` to call domain services.
- [ ] Remove legacy business logic from persistence after parity validation.
- [ ] Update crate READMEs and architecture docs.
