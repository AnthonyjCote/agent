/**
 * Purpose: Provide a reusable premium text input field control.
 * Responsibilities:
 * - Render controlled single-line text/password inputs.
 * - Keep field treatment consistent with shared dropdown styles.
 */
// @tags: shared-ui,controls,text-field
// @status: active
// @owner: founder
// @domain: shared
// @adr: none

import './TextField.css';

type TextFieldType = 'text' | 'password';

type TextFieldProps = {
  value: string;
  onValueChange: (next: string) => void;
  ariaLabel: string;
  type?: TextFieldType;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
};

export function TextField({
  value,
  onValueChange,
  ariaLabel,
  type = 'text',
  placeholder,
  disabled = false,
  invalid = false
}: TextFieldProps) {
  return (
    <input
      className={`text-field-control${invalid ? ' is-invalid' : ''}`}
      type={type}
      value={value}
      aria-label={ariaLabel}
      aria-invalid={invalid ? 'true' : undefined}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    />
  );
}
