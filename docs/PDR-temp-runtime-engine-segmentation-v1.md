# PDR (Temp): Runtime Engine Segmentation v1

## Purpose
Prevent `backend/crates/agent_core/src/runtime/engine.rs` from becoming a monolith by formalizing separation-of-concerns boundaries before further runtime features land.

## Current Problem
- `engine.rs` currently mixes multiple concerns in one file:
  - prompt assembly
  - ack parsing/routing
  - inference stream collection
  - prefetch orchestration
  - tool-call orchestration
  - work-log/debug formatting
  - final response extraction/completion events
- At current size, continued growth will increase regression risk and slow development velocity.

## Goals
- Keep top-level runtime orchestration readable and testable.
- Move implementation details into dedicated modules with narrow responsibilities.
- Preserve existing runtime behavior while making future iteration safer.

## Target Segmentation

### 1) `runtime/run_executor.rs`
- Owns top-level run loop and phase transitions.
- Keeps only orchestration flow, not formatting/parsing internals.

### 2) `runtime/prompt_builder.rs`
- Owns prompt/context assembly:
  - ack prompt
  - deep prompt
  - static instruction blocks
  - sentinel guidance

### 3) `runtime/ack_router.rs`
- Owns ack envelope schema + parsing + validation.
- Normalizes ack decisions and fallback behavior.

### 4) `runtime/inference_stream.rs`
- Owns stream collection and delta handling:
  - collect text
  - visible delta filtering
  - stream-line debug capture

### 5) `runtime/tool_orchestrator.rs`
- Owns model tool envelope parse + tool execution path:
  - allowed-tool checks
  - dispatch to built-in or external executors
  - tool result/error formatting for runtime logs

### 6) `runtime/prefetch_orchestrator.rs`
- Owns prefetch runtime wiring and clarification gating:
  - calls shared `tools::toolbox_prefetch::resolve_prefetch`
  - returns context packets and optional clarification short-circuit

### 7) `runtime/event_writer.rs`
- Owns event append helper(s) and event-shaping helpers for consistency.

### 8) `runtime/work_log.rs`
- Owns work-log helpers:
  - compact truncation
  - reasoning extraction
  - bounded insertion policies

### 9) `runtime/finalize.rs`
- Owns final response extraction:
  - sentinel strip
  - block creation
  - run completion event creation

## Runtime API Shape
- Keep `runtime/engine.rs` as a thin compatibility façade:
  - exposes current public functions
  - delegates to `run_executor`.
- Avoid broad cross-module imports by passing small explicit context structs.

## Suggested Folder Layout
- `runtime/orchestration/*`: run executor, ack router, tool/prefetch orchestration
- `runtime/prompt/*`: prompt builders/context assembly
- `runtime/events/*`: event writer and debug shapers
- `runtime/logging/*`: work log helpers
- `runtime/finalize/*`: final response utilities

## Migration Plan
1. Create module skeletons and move helper functions without behavior changes.
2. Replace internal calls in `engine.rs` with module calls.
3. Shrink `engine.rs` to façade + public entry points.
4. Add targeted tests by module boundary.

## Acceptance Criteria
- `engine.rs` reduced to orchestration façade.
- No behavior regressions in:
  - ack routing
  - tool calling
  - prefetch clarification gating
  - stream delta emission
  - final response handling

## Rolling Notes
### 2026-03-10
- Locked decision to segment runtime engine across dedicated modules listed above.
- Locked decision to keep `engine.rs` as compatibility façade during migration.
