# app_domain_org

Org domain business logic crate.

Current modules:
- `models.rs`: domain-level summaries/types.
- `ports.rs`: persistence-facing trait contracts.
- `service.rs`: org domain entrypoints and rule helpers.

This crate should own org business orchestration, while persistence adapters live in `app_persistence`.
