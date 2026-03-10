# Runtime Module

`runtime/` contains the single-run execution path for an agent turn. It is intentionally split by concern so changes stay local and reviewable.

## Folder Map

- `execution/`: run orchestration and stage control (ack, deep, tool, finalize).
- `prompt/`: prompt/context assembly for ack/deep stages.
- `streaming/`: provider stream ingestion and delta/event bridging.
- `events/`: runtime event emission helpers.
- `logging/`: ephemeral run-scoped logs (for loop continuity and diagnostics).
- `parsing/`: strict parsing for structured model outputs.
- `context/`: shared run context structures passed across stages.
- `concurrency/`: run/thread coordination and side-effect safety guards.
- `tracing/`: in-memory trace store plumbing used during a run.
- `testing/`: test-only runtime inference helpers and fakes.
- `routing/`: reserved for runtime routing policies as they grow.

## Design Rules

- Keep files focused: one primary responsibility per file.
- Avoid large cross-cutting helpers in `execution/`; move reusable logic to the appropriate concern folder.
- Keep deterministic policy logic outside provider stream handling.
- Treat `engine.rs` as thin entrypoint wiring only.
