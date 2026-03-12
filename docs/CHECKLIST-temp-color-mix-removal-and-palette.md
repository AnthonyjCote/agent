# CHECKLIST: Temp Color-Mix Removal and Palette Migration

Status: Draft  
Owner: Founder + Codex  
Scope: `frontend/src` styles only  
Goal: Remove all `color-mix(...)` usage and migrate to explicit palette vars.

## Summary

- Total `color-mix(...)` usages: `205`
- Total files impacted: `34`
- Constraint: no `color-mix(...)` in final styles.

## Phase 1: Lock Palette Tokens

- [ ] Define canonical palette token file(s) for borders, text states, surfaces, accents, danger, success, warning.
- [ ] Define explicit interaction tokens (hover/active/focus/disabled) with fixed color values.
- [ ] Define domain-safe aliases for shared controls (buttons, dropdowns, inputs, tabs, cards, rails, modals).
- [ ] Confirm token naming conventions and ownership location.
- [ ] Confirm browser/runtime compatibility baseline (no `color-mix` dependency).

## Phase 2: Shared UI and Tokens First

- [ ] `frontend/src/shared/ui/controls/ControlField.tokens.css` (4)
- [ ] `frontend/src/shared/ui/controls/DropdownSelector.css` (5)
- [ ] `frontend/src/shared/ui/controls/ToggleSwitch.css` (2)
- [ ] `frontend/src/shared/ui/chat/ChatComposerShell.css` (5)
- [ ] `frontend/src/shared/ui/layout/TopRailShell.css` (1)
- [ ] `frontend/src/shared/ui/layout/ModalTopRail.css` (1)
- [ ] `frontend/src/shared/ui/layout/LeftColumnTopBar.css` (1)
- [ ] `frontend/src/shared/ui/layout/LeftColumnShell.css` (1)
- [ ] `frontend/src/shared/ui/overlays/ModalShell.css` (3)
- [ ] `frontend/src/shared/ui/overlays/ConfirmDialogModal.css` (1)
- [ ] `frontend/src/shared/ui/feedback/InfoTooltip.css` (3)
- [ ] `frontend/src/shared/ui/surfaces/AgentGrid.css` (7)
- [ ] `frontend/src/shared/ui/surfaces/ColumnCard.css` (1)
- [ ] `frontend/src/shared/ui/avatar/AgentAvatar.css` (1)
- [ ] `frontend/src/shared/ui/empty-state/CenteredEmptyState.css` (1)

## Phase 3: Shared Modules

- [ ] `frontend/src/shared/modules/debug/surface/DebugCardsPanel.css` (9)
- [ ] `frontend/src/shared/modules/agent-manifest/AgentManifestModal.css` (4)
- [ ] `frontend/src/shared/modules/agent-manifest/AgentAvatarCropModal.css` (1)

## Phase 4: Domain Surfaces

- [ ] `frontend/src/domains/chat-gui/surface/ChatGuiSurface.css` (40)
- [ ] `frontend/src/domains/debug/surface/DebugSurface.css` (23)
- [ ] `frontend/src/domains/agent-chart/surface/AgentChartSurface.css` (23)
- [ ] `frontend/src/domains/comms/surface/chat/CommsChatSurface.css` (19)
- [ ] `frontend/src/domains/comms/surface/sms/CommsSmsSurface.css` (11)
- [ ] `frontend/src/domains/comms/surface/email/CommsEmailSurface.css` (9)
- [ ] `frontend/src/domains/comms/surface/top-rail/CommsTopRailSurface.css` (6)
- [ ] `frontend/src/domains/comms/surface/top-rail/account-selector-modal/CommsAccountSelectorModal.css` (3)
- [ ] `frontend/src/domains/comms/surface/email/compose-modal/ComposeEmailModal.css` (4)
- [ ] `frontend/src/domains/comms/surface/email/compose-modal/ComposeEmailContactsModal.css` (3)
- [ ] `frontend/src/domains/comms/surface/email/read-modal/ReadEmailModal.css` (1)
- [ ] `frontend/src/domains/comms/surface/sms/compose-modal/ComposeSmsModal.css` (3)
- [ ] `frontend/src/domains/comms/surface/sms/compose-modal/ComposeSmsContactsModal.css` (3)
- [ ] `frontend/src/domains/comms/surface/shared/CommsComposeFab.css` (1)
- [ ] `frontend/src/domains/comms/view.css` (1)
- [ ] `frontend/src/domains/app-settings/surface/AppSettingsSurface.css` (4)

## Phase 5: Validation and Guardrails

- [ ] Run repo-wide check: `rg -n "color-mix\\(" frontend/src --glob '*.{css,scss,ts,tsx}'`
- [ ] Confirm result count is `0`.
- [ ] Verify critical pages visually: Chat GUI, Org Chart, Comms (Email/SMS/Chat), Debug, Settings.
- [ ] Add lint/CI guard to block future `color-mix(` usage in frontend styles.

## Notes

- Prioritize shared token/control layers first to minimize domain rework.
- Use fixed palette vars only; no runtime color math functions.
