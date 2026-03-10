# App Domains

Domain-layer crates for app business logic shared across UI-driven and agent-driven workflows.

Current crates:
- `core`: shared domain errors/types.
- `org`: org-chart domain service layer.
- `comms`: communications domain service layer.

Boundary rule:
- Keep persistence/storage mechanics in `app_persistence`.
- Keep runtime orchestration in `agent_core`.
- Put business rules/use-case logic for app domains here.
