# PDR: Temp Design Token System and Theming Foundation (V1)

Status: Draft  
Owner: Founder + Codex  
Date: 2026-03-11  
Scope: Frontend style system (`frontend/src`)  

## 1. Problem

Current styling is partially tokenized but incomplete:
- Root tokens are minimal in `frontend/src/app/app.css`.
- Many components still compute colors inline (notably via `color-mix(...)`).
- Visual behavior differs across runtimes (desktop webview fallback to washed/default controls).
- Theming is not structured for future app customization.

We need a complete, deterministic token system that:
- removes runtime color math,
- standardizes shared UI styling,
- supports future theme variants cleanly.

## 2. Decision Summary

1. Build a full semantic design-token system for app-wide UI.
2. Keep token definitions centralized in `frontend/src/app/app.css` for V1.
3. Organize `:root` token blocks into clearly commented sections.
4. Remove all `color-mix(...)` usage and replace with fixed token values.
5. Use semantic tokens (role/state based), not component-local hardcoded colors.
6. Add optional theme scopes later (`[data-theme="..."]`) without changing component contracts.

## 3. Token Model (V1)

### 3.1 Core Palette Tokens (raw)

Purpose: canonical base colors only.

- `--palette-neutral-*`
- `--palette-blue-*`
- `--palette-green-*`
- `--palette-amber-*`
- `--palette-red-*`

### 3.2 Semantic Surface Tokens

- `--surface-app`
- `--surface-shell`
- `--surface-panel-1`
- `--surface-panel-2`
- `--surface-panel-3`
- `--surface-overlay`
- `--surface-inset`

### 3.3 Semantic Border Tokens

- `--border-subtle`
- `--border-default`
- `--border-strong`
- `--border-accent`
- `--border-danger`
- `--border-success`
- `--border-warning`

### 3.4 Semantic Text Tokens

- `--text-primary`
- `--text-secondary`
- `--text-muted`
- `--text-inverse`
- `--text-accent`
- `--text-danger`
- `--text-success`
- `--text-warning`

### 3.5 Interactive/State Tokens

- `--state-hover-surface`
- `--state-active-surface`
- `--state-selected-surface`
- `--state-focus-ring`
- `--state-disabled-opacity`
- `--state-danger-hover-surface`
- `--state-danger-active-surface`

### 3.6 Typography Tokens

- Font families:
  - `--font-family-base`
  - `--font-family-mono`
- Font sizes:
  - `--font-size-11` through `--font-size-32` (defined scale)
- Font weights:
  - `--font-weight-regular`
  - `--font-weight-medium`
  - `--font-weight-semibold`
  - `--font-weight-bold`
- Line heights:
  - `--line-height-tight`
  - `--line-height-base`
  - `--line-height-relaxed`

### 3.7 Layout/Spacing Tokens

- `--space-2`, `--space-4`, `--space-6`, `--space-8`, `--space-10`, `--space-12`, ...
- `--layout-shell-padding-x`
- `--layout-shell-padding-top`
- `--layout-top-rail-height`
- `--layout-left-column-width-standard`
- `--layout-left-column-width-wide`

### 3.8 Radius/Border/Shadow Tokens

- Radius:
  - `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-pill`
- Stroke:
  - `--stroke-1`, `--stroke-2`
- Shadows:
  - `--shadow-sm`, `--shadow-md`, `--shadow-lg`
- Hairlines:
  - `--hairline-strong`
  - `--hairline-subtle`

### 3.9 Component Contract Tokens (shared UI)

Define component-facing semantic aliases so shared controls remain stable:
- Buttons:
  - `--button-primary-bg`, `--button-primary-bg-hover`, `--button-primary-text`, ...
- Inputs/Dropdowns:
  - `--field-bg`, `--field-border`, `--field-border-hover`, `--field-border-focus`, `--field-placeholder`
- Cards:
  - `--card-bg`, `--card-border`, `--card-border-active`
- Top rails:
  - `--top-rail-bg`, `--top-rail-border`
- Modal:
  - `--modal-bg`, `--modal-border`, `--modal-header-border`, `--modal-footer-border`

## 4. `app.css` Organization (explicit)

Use one `:root` block grouped with comment headers in this order:

1. Foundations
2. Core Palette
3. Semantic Surfaces
4. Semantic Borders
5. Semantic Text
6. Semantic States
7. Typography
8. Spacing/Layout
9. Radius/Stroke/Shadow
10. Shared Component Contracts

Example pattern:
- `/* ===== 03 Semantic Surfaces ===== */`
- token lines

This is the preferred V1 approach and aligns with your request to keep tokens centralized in `app.css`.

## 5. Migration Plan

### Phase A: Token Authoring

- Add full token set to `app.css` with section comments.
- Keep existing tokens temporarily as aliases for backward compatibility.

### Phase B: Shared UI Refactor

- Migrate shared UI files first (`shared/ui/*`, `shared/modules/*`).
- Replace all `color-mix(...)` with direct semantic token references.

### Phase C: Domain Refactor

- Migrate `chat-gui`, `agent-chart`, `comms`, `debug`, `app-settings`.
- Remove any remaining hardcoded one-off colors unless intentionally branded.

### Phase D: Theming Hook

- Add optional scoped theme blocks:
  - `:root[data-theme="default"]`
  - `:root[data-theme="high-contrast"]`
  - `:root[data-theme="brand-x"]`
- Initial implementation can remain single-theme while preserving structure.

### Phase E: Guardrails

- CI/lint rule to reject `color-mix(` in frontend styles.
- Style review checklist requires semantic token usage in new UI.

## 6. Acceptance Criteria

- `rg -n "color-mix\\(" frontend/src --glob '*.{css,scss,ts,tsx}'` returns `0`.
- All shared controls (buttons, dropdowns, inputs, rails, modals) render consistently in desktop/web.
- No washed/default browser button fallbacks in debug/comms/chat contexts.
- Token names are documented and discoverable in `app.css`.
- Theme extension path exists without refactoring component CSS contracts.

## 7. Implementation Checklist

- [ ] Finalize token naming map.
- [ ] Author full sectioned token system in `frontend/src/app/app.css`.
- [ ] Map existing core tokens (`--bg-*`, `--text-*`, `--border-*`, `--accent`) to semantic set.
- [ ] Migrate shared UI control tokens (`ControlField.tokens.css`, buttons/dropdowns/inputs).
- [ ] Execute full `color-mix` removal checklist from:
  - `docs/CHECKLIST-temp-color-mix-removal-and-palette.md`
- [ ] Add guardrail check for `color-mix(` in CI/lint.
- [ ] Validate visual parity across key domains.

## 8. Notes

- V1 keeps tokens in `app.css` for speed and discoverability.
- If token volume grows too large, V2 can split into:
  - `app.tokens.base.css`
  - `app.tokens.semantic.css`
  - `app.tokens.components.css`
  while preserving the same contracts.
