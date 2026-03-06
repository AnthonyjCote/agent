# Header and Codemap System

## Purpose
Define the required per-file metadata header standard and explain how codemap/validation tooling uses it.

## Why This Exists
- Makes file ownership and responsibility explicit.
- Enables machine-readable architecture reporting.
- Prevents metadata drift with lint validation.
- Speeds onboarding, search, and refactor planning.

## Required Header Format
All tracked code/style files (`.ts`, `.tsx`, `.js`, `.jsx`, `.rs`, `.css`) must include a metadata header near the top.

Example:

```ts
/**
 * Purpose: One-line statement of what this file owns.
 * Responsibilities:
 * - Primary behavior this file implements.
 * - Secondary behavior this file owns.
 * Constraints: Optional informational note about intended scope and limits.
 */
// @tags: builder,drag-drop,ui
// @status: active
// @owner: founder
// @domain: builder
// @adr: ADR-0001
```

CSS example:

```css
/*
 * Purpose: Styles for reusable toggle switch component.
 * Responsibilities:
 * - Defines base switch track and thumb states.
 * - Defines disabled and checked visual states.
 * Constraints: Optional informational note about where these styles should be used.
 */
/* @tags: shared-ui,css,controls */
/* @status: active */
/* @owner: founder */
/* @domain: shared */
/* @adr: none */
```

## Field Definitions
- `Purpose`: one concise responsibility sentence.
- `Responsibilities`: 1-4 concrete bullets.
- `Constraints` (optional): informational line for intended scope, boundaries, or non-goals. This is not validated and does not use `@` metadata format.
- `@tags`: comma-separated tags from `docs/codemap/indexes/TAG-INDEX.md`.
- `@status`: enum from `STATUS-INDEX.md`.
- `@owner`: enum from `OWNER-INDEX.md`.
- `@domain`: enum from `DOMAIN-INDEX.md`, should match folder domain.
- `@adr`: ADR id from `ADR-INDEX.md` or `none`.

## Validation Tooling
### Metadata validator
- Command: `npm run codemap:validate`
- Script: `docs/codemap/scripts/validate-script-metadata.mjs`
- Output report: `docs/codemap/validation-report.json`

Validation checks:
- header field presence
- enum validity (`tags`, `status`, `owner`, `domain`, `adr`)
- grouped error output by file (`file + codes[]`)

`Constraints` notes are intentionally excluded from validator rules (optional and informational only).

### Codemap generator
- Command: `npm run codemap:generate`
- Script: `docs/codemap/scripts/generate-codemap.mjs`
- Outputs:
  - `docs/codemap/CODEMAP.md`
  - `docs/codemap/CODEMAP.html`

Generated codemap supports:
- file index with metadata fields
- summary cards and counts
- HTML filtering (search, extension, domain, owner, status, size risk)

### Size-risk lint
- Command: `npm run lint:size`
- Script: `docs/codemap/scripts/check-file-size-risk.mjs`
- Report: `docs/codemap/file-size-report.json`
- Thresholds:
  - `ok < 400`
  - `warning 400-700`
  - `flag > 700`
- Allowlist: `docs/codemap/indexes/SIZE-RISK-ALLOWLIST.json`

### Stylemap diagnostics
- Command: `npm run stylemap:generate`
- Script: `docs/stylemap/scripts/generate-stylemap.mjs`
- Outputs:
  - `docs/stylemap/stylemap-report.json`
  - `docs/stylemap/STYLEMAP.md`
  - `docs/stylemap/STYLEMAP.html`

## Workflow
1. Create/update file with metadata header.
2. Run `npm run codemap:validate`.
3. Run `npm run codemap:generate` when metadata/structure changes.
4. Run `npm run lint:size` to check anti-monolith thresholds.
5. Update ADR/tag/domain indexes when introducing new values.

## Best Practices
- Keep tags focused (3-6 tags per file).
- Keep `Purpose` stable; update only when responsibility changes.
- Use `Constraints` for human clarity when helpful (example: `Composition/wiring only; delegate business logic to hooks/modules.`).
- Update `@status` as migration progresses.
- Avoid allowlisting source files unless actively being split.
- Keep header edits in same commit as behavior changes.
