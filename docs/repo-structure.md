# Agent Deck Repo Structure (UI App)

This document defines the target frontend folder structure for the Agent Deck app, based on the `licensing-software/apps/console/src` layout.

## Goals

- Keep cross-domain code in one place (`shared`).
- Keep route/view ownership clear (`domains`).
- Make each top-level domain consistent so contributors can move quickly.

## Target `src` Layout

```text
src/
  app/
    styles/
  assets/
  shared/
    config/
    modules/
    ui/
  domains/
    <domain-name>/
      api/
      lib/
      model/
      modules/
      surface/
      view.tsx
      index.ts
```

## Folder Contracts

### `app/`
- Shell, router, providers, and global app styles.
- App-wide styles belong here (`app/styles`), not in `shared`.

### `shared/`
Purpose: reusable, domain-neutral code used by multiple domains.

Allowed top-level folders:
- `shared/config`: app-level config surfaces, flags, schemas, selectors.
- `shared/modules`: reusable cross-domain modules.
- `shared/ui`: shared UI primitives and neutral presentational patterns.

Rules:
- `shared/**` must not import from `domains/**`.
- `shared/ui` should only contain reusable primitives, not domain-specific behavior.

### `domains/`
Purpose: route-level/top-level view ownership.

Each domain folder in `domains/` maps to one top-level page/view in the app and uses the same internal structure:
- `surface/`: UI composition and visible anatomy.
- `model/`: domain state and orchestration logic.
- `api/`: I/O adapters and request boundaries.
- `lib/`: pure helpers scoped to that domain.
- `modules/`: optional pluggable units scoped to that domain.
- `view.tsx`: domain page/view entry component.
- `index.ts`: domain public export surface.

## Import Boundary Rules

- `domains/<name>/**` can import from:
  - `shared/**`
  - same domain (`domains/<name>/**`)
- `domains/<name>/**` should not import from other domain internals.
- Cross-domain reuse should be promoted to `shared/**` instead of direct domain-to-domain coupling.

## Naming Conventions

- Domain folder names use kebab-case (for example: `agent-editor`, `run-console`).
- Keep file names descriptive and local to responsibility (`view.tsx`, `index.ts`, feature-specific files inside subfolders).

## Suggested Initial Domains (Agent Deck)

- `domains/deck`
- `domains/canvas`
- `domains/agent-editor`
- `domains/run-console`
- `domains/settings`

These can be adjusted as product scope evolves, but the internal domain contract should remain consistent.
