# org_manage_entities_v2 Tool

This folder owns the model-facing contract and handler path for the org management tool.

- `manifest.rs`: tool metadata + instruction detail exposed to the model.
- `input.rs`: argument shape validation/parsing.
- `handler.rs`: tool execution entrypoint called by shared app dispatch.
- `output.rs`: maps backend/domain output to `ToolOutputEnvelope`.

Business orchestration is being migrated to `crates/app_domains/org`.
Persistence/storage concerns remain in `crates/app_persistence` adapters.
