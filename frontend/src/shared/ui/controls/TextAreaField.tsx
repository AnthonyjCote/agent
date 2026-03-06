/**
 * Purpose: Provide a reusable premium multi-line text area control.
 * Responsibilities:
 * - Render controlled multi-line text input surfaces.
 * - Keep text area treatment consistent with shared field tokens.
 */
// @tags: shared-ui,controls,text-area
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import './TextAreaField.css';

type TextAreaFieldProps = {
  value: string;
  onValueChange: (next: string) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  minRows?: number;
  invalid?: boolean;
};

export function TextAreaField({
  value,
  onValueChange,
  ariaLabel,
  placeholder,
  disabled = false,
  minRows = 4,
  invalid = false
}: TextAreaFieldProps) {
  return (
    <textarea
      className={`text-area-field-control${invalid ? ' is-invalid' : ''}`}
      value={value}
      aria-label={ariaLabel}
      aria-invalid={invalid ? 'true' : undefined}
      placeholder={placeholder}
      disabled={disabled}
      rows={minRows}
      onChange={(event) => onValueChange(event.target.value)}
    />
  );
}
