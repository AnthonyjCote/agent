# Context

Shared runtime context types passed across execution stages.

Responsibilities:
- Define per-run context containers.
- Hold immutable/mutable state references needed by stage handlers.

Avoid provider-specific logic in this folder.
