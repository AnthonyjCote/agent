# app_domain_comms

Comms domain business logic crate.

Current modules:
- `models.rs`: comms domain types.
- `ports.rs`: persistence-facing trait contracts.
- `service.rs`: comms domain entrypoints and rule helpers.

This crate should own comms business orchestration, while persistence adapters live in `app_persistence`.
