# comms_tool

This folder owns the model-facing contract and handler path for communications tool calls.

- `manifest.rs`: tool metadata + instruction detail exposed to the model.
- `input.rs`: argument validation for `ops`-based payloads.
- `handler.rs`: tool execution entrypoint used by shared app dispatch.
- `output.rs`: maps backend/domain output to `ToolOutputEnvelope`.
- `prefetch.rs`: fast-ack prefetch helpers for comms-specific context expansion.

Business orchestration is being migrated to `crates/app_domains/comms`.
Persistence/storage concerns remain in `crates/app_persistence` adapters.
