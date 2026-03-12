/**
 * Purpose: Provide a reusable premium switch control for boolean settings.
 * Responsibilities:
 * - Render accessible switch semantics with keyboard/click behavior.
 * - Expose controlled checked state for shared form composition.
 */
// @tags: shared-ui,controls,toggle
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import './ToggleSwitch.css';

type ToggleSwitchProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
};

export function ToggleSwitch({ checked, onCheckedChange, ariaLabel, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      className={`toggle-switch${checked ? ' checked' : ''}`}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="toggle-switch-thumb" aria-hidden="true" />
    </button>
  );
}
