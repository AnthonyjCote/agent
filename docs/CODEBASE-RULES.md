# Codebase Rules

These rules apply to both frontend and backend code in Agent Deck.

## 1) No Monolith Files

- Avoid large mixed-responsibility files.
- Keep files focused on a single purpose and clear ownership.
- Break large workflows into logically segmented modules.
- As a hard guideline, avoid source files growing into "giant script" territory (for example, 5000-line mixed-use files).

## 2) Co-Locate Styles With UI Elements

- Styles must live with the UI element they style.
- Do not create broad/global classes for component-specific styling.
- Reuse existing tokens, primitives, and patterns before introducing new classes.
- Keep styles DRY by composing shared primitives/utilities instead of duplicating declarations.

## 3) No Ad Hoc UI Elements

- Do not build one-off UI elements directly in domain views when a reusable element is appropriate.
- Create UI elements as shared components first, then consume them from domains.
- Domain code should compose shared UI, not redefine common controls.

## 4) README Files for Main Folders

- Every main folder must include a `README.md`.
- Each README should briefly explain:
  - folder purpose
  - what belongs there
  - what does not belong there
- Keep READMEs updated when folder responsibilities change.

## 5) Prefer Barrel Exports

- Use barrel exports (`index.ts`) at folder boundaries.
- Import from public folder surfaces, not deep nested internals.
- Deep imports should be treated as exceptions and justified only when necessary.

## Enforcement Notes

- These rules are architecture constraints, not suggestions.
- New code and refactors should move the codebase toward these standards.
