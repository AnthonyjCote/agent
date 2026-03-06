# Rust Architecture Rules

These rules keep Rust code maintainable across `agent_core`, `agent_desktop`, and `agent_server`.

## 1) Crate Responsibilities

- `agent_core`: portable domain/application logic only.
- `agent_desktop`: Tauri/OS adapter layer only.
- `agent_server`: HTTP/WS/workers/webhook adapter layer only.
- No business-logic duplication across adapter crates.

## 2) File Size and Scope Limits

- Soft file-size cap: `300` LOC.
- Hard file-size cap: `500` LOC (must split unless explicitly allowlisted).
- One file should have one primary reason to change.
- Do not mix transport handlers, domain rules, storage, and mapping in one file.

## 3) Module Structure

Use explicit modules per crate (or equivalent):
- `domain/`
- `application/`
- `infrastructure/`
- `transport/` (where relevant)

Avoid:
- catch-all `utils.rs` files
- large dumping-ground modules

## 4) Trait-First Boundaries

- Core depends on traits/interfaces, not platform implementations.
- Examples: provider execution, storage, tool execution, event sinks.
- Desktop/server crates provide concrete implementations.

## 5) DTO and Domain Separation

- Keep transport DTOs in transport layer.
- Map DTOs at boundaries into domain models.
- Do not leak Tauri/Axum/request types into `agent_core`.

## 6) Error Handling Discipline

- Use typed errors at domain boundaries.
- Keep adapter-specific errors in adapter crates.
- Avoid unstructured, cross-layer error propagation.

## 7) Testing Rules

- Unit tests: colocated with module logic.
- Contract tests: for trait implementations and boundary behavior.
- Integration tests: per crate boundary (`core`, `desktop`, `server`).

## 8) CI Enforcement

- Run `cargo fmt`, `cargo clippy`, and tests on every PR.
- Add checks for forbidden dependencies (example: block `tauri` in `agent_core`).
- Add file-size risk checks with explicit allowlist process for exceptions.

## 9) PR Review Checklist

- Does this introduce cross-layer coupling?
- Does any file exceed the soft/hard size threshold?
- Is responsibility mixed in a single file/module?
- Are DTO/domain boundaries preserved?
- Are tests added/updated at the correct boundary?
